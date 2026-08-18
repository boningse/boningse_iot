const assert = require('assert');
const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const {
  buildConfiguredJsonAutoResponse,
  parseConfiguredJsonUplink
} = require('../utils/configuredJsonProtocol');
const { buildProtocolControlMessages } = require('../services/switchControlExecutor');

const pool = new Pool(getPoolConfig());

const sample = {
  SysTime: '2026-08-18 09:00:00',
  bid: 201,
  mid: '6F9619FF-8B86-D011-B42D-00C04FC964FF',
  Children: [{
    ClientID: 'LP26100001',
    Voltage: [220180, 0, 0, 0],
    Current: [11000, 0, 0, 0],
    Power: [2812, 0, 0, 0],
    Energy: [15140, 0, 0, 0],
    Temperature: [2350, 0, 0, 0],
    ElectricStatus: 0,
    SwitchStatus: 1,
    Mode: 0,
    UsartComm: 0
  }]
};

async function main() {
  const result = await pool.query(
    `SELECT name, manufacturer_code, device_type, data_parsing_config, command_config
       FROM protocol_configs
      WHERE name = $1 AND manufacturer_code = $2`,
    ['HPFEPA', 'HPFEPA']
  );
  assert.strictEqual(result.rows.length, 1, 'HPFEPA协议不存在或不唯一');
  const protocol = result.rows[0];
  assert.strictEqual(protocol.device_type, '定时开关');

  const parsed = parseConfiguredJsonUplink(sample, protocol.data_parsing_config);
  assert.strictEqual(parsed.matched, true);
  assert.strictEqual(parsed.data.client_id, 'LP26100001');
  assert.strictEqual(parsed.data.power_status, true);
  assert.strictEqual(parsed.data.voltage, 220.18);
  assert.strictEqual(parsed.data.current, 11);
  assert.strictEqual(parsed.data.power, 2812);
  assert.ok(Math.abs(parsed.data.energy - 15.14) < 1e-9);
  assert.strictEqual(parsed.data.temperature, 23.5);

  const lockedSample = JSON.parse(JSON.stringify(sample));
  lockedSample.Children[0].SwitchStatus = 2;
  const locked = parseConfiguredJsonUplink(lockedSample, protocol.data_parsing_config);
  assert.strictEqual(locked.data.power_status, null);
  assert.strictEqual(locked.data.lock_status, true);

  const device = {
    imei: 'GW00000001',
    device_code: 'LP26100001',
    manufacturer_code: 'HPFEPA',
    connection_config: { client_id: 'LP26100001' },
    command_config: protocol.command_config
  };
  const on = buildProtocolControlMessages(device, { type: 'event', power_status: true });
  const off = buildProtocolControlMessages(device, { type: 'event', power_status: false });
  const read = buildProtocolControlMessages(device, { type: 'statistic' });
  assert.strictEqual(on[0].topic, 'zhhl/EPA/LP26100001/subscribe');
  assert.strictEqual(on[0].payload.bid, 202);
  assert.strictEqual(on[0].payload.Children[0].MoterOperation, 1);
  assert.strictEqual(off[0].payload.Children[0].MoterOperation, 2);
  assert.strictEqual(read[0].payload.bid, 208);
  assert.match(on[0].payload.mid, /^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/);

  const heartbeat = buildConfiguredJsonAutoResponse(
    { bid: 101 },
    device,
    protocol.command_config
  );
  assert.strictEqual(heartbeat.topic, 'zhhl/EPA/LP26100001/subscribe');
  assert.deepStrictEqual(heartbeat.payload, { bid: 101 });

  console.log(JSON.stringify({
    protocol: protocol.name,
    parsed: parsed.data,
    commands: {
      turn_on: on[0],
      turn_off: off[0],
      read_status: read[0],
      heartbeat
    }
  }, null, 2));
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error.stack || error.message);
    await pool.end();
    process.exit(1);
  });
