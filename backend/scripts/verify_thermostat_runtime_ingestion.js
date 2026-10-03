// Verify the actual ingestion code against temporary copies of the live schema.
// No MQTT connection is opened and all database changes are rolled back.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');

const backendRoot = process.env.IOT_BACKEND_ROOT || path.resolve(__dirname, '..');
const rootRequire = Module.createRequire(path.join(backendRoot, 'package.json'));
rootRequire('dotenv').config({ path: path.join(backendRoot, '.env') });
const { Pool } = rootRequire('pg');
const { getPoolConfig } = rootRequire('./config/database');
const logs = [];
const models = rootRequire('./models');
models.DeviceLog.create = async entry => {
  const log = { ...entry, async update(values) { Object.assign(this, values); return this; } };
  logs.push(log);
  return log;
};
const logger = rootRequire('./utils/logger').mqttLogger;
for (const level of ['debug', 'info', 'warn', 'error']) logger[level] = () => {};
const sourcePath = path.join(backendRoot, 'services/mqttService.js');
const serviceModule = new Module(sourcePath, module);
serviceModule.filename = sourcePath;
serviceModule.paths = Module._nodeModulePaths(path.dirname(sourcePath));
serviceModule._compile(fs.readFileSync(process.env.RUNTIME_SERVICE_FILE || sourcePath, 'utf8'), sourcePath);
const service = serviceModule.exports;

const packet = {
  func: 'read', eCode: 0, uuid: '863434088100596', pType: 'time',
  body: {
    id: [1], data: [[0, 58, 0, 0, 0, 45, 2702, 1571615, 243133]],
    items: ['FanLow', 'FanMiddle', 'FanHigh', 'HeatLow', 'HeatMiddle', 'HeatHigh', 'CoolLow', 'CoolMiddle', 'CoolHigh']
  }
};

async function verify() {
  const testPool = new Pool(getPoolConfig());
  const client = await testPool.connect();
  const originalConnect = Pool.prototype.connect;
  try {
    await client.query('BEGIN');
    await client.query('CREATE TEMP SEQUENCE verify_runtime_sequence');
    await client.query('CREATE TEMP TABLE thermostat_runtime_stats (LIKE public.thermostat_runtime_stats INCLUDING ALL)');
    await client.query("ALTER TABLE thermostat_runtime_stats ALTER COLUMN id SET DEFAULT nextval('pg_temp.verify_runtime_sequence')");
    await client.query('CREATE TEMP TABLE thermostat_runtime_snapshots (LIKE public.thermostat_runtime_snapshots INCLUDING ALL)');
    await client.query('CREATE TEMP TABLE thermostat_runtime_history (LIKE public.thermostat_runtime_history INCLUDING ALL)');
    const { rows } = await client.query(`SELECT id, data_parsing_config FROM protocol_configs WHERE id = '73d17555-fed3-413f-88f1-0ece5ed37b23'`);
    assert.equal(rows.length, 1);
    const device = {
      id: 'f01a00eb-ab12-4473-8ebb-eeb861ce0d4e', is_thermostat: true,
      device_category: 'standalone', protocol_config: rows[0]
    };
    Pool.prototype.connect = async () => ({
      query: (sql, params) => {
        const commands = { BEGIN: 'SAVEPOINT runtime_write', COMMIT: 'RELEASE SAVEPOINT runtime_write', ROLLBACK: 'ROLLBACK TO SAVEPOINT runtime_write' };
        return client.query(commands[sql] || sql, params);
      },
      release() {}
    });
    service.getDeviceWithCache = async () => device;
    service.updateDeviceStatus = async () => {};
    const topic = 'zhhl/BNWKQ/863434088100596/publish';
    assert.equal(service.determineMessageType(packet, topic), 'time');
    const mapping = rows[0].data_parsing_config.time_mapping;
    const parsed = service.parseRuntimeRows(packet, mapping);
    assert.equal(parsed[0].values.fan_middle_runtime, 58);
    assert.equal(parsed[0].values.heat_high_runtime, 45);
    assert.equal(parsed[0].values.cool_low_runtime, 2702);
    assert.equal(parsed[0].values.cool_middle_runtime, 1571615);
    assert.equal(parsed[0].values.cool_high_runtime, 243133);
    const reversed = structuredClone(packet);
    reversed.body.items.reverse(); reversed.body.data[0].reverse();
    assert.deepEqual(service.parseRuntimeRows(reversed, mapping), parsed);
    await service.handleMessageByType(packet.uuid, packet, topic, 'time');
    const snapshot = (await client.query('SELECT * FROM thermostat_runtime_snapshots')).rows[0];
    assert.equal(Number(snapshot.cool_middle_runtime), 1571615);
    assert.ok(snapshot.last_received_at);
    const firstHistory = (await client.query('SELECT * FROM thermostat_runtime_history')).rows;
    assert.equal(firstHistory.length, 1);
    assert.equal(Number(firstHistory[0].cool_middle_runtime), 1571615);
    assert.equal(logs[0].data.processingStatus, 'stored');
    assert.deepEqual(logs[0].data.payload, packet);
    assert.equal(Number((await client.query('SELECT runtime_speed2 FROM thermostat_runtime_stats')).rows[0].runtime_speed2), 0);
    const nextPacket = structuredClone(packet);
    nextPacket.body.data[0][7] += 120;
    await service.handleMessageByType(packet.uuid, nextPacket, topic, 'time');
    await service.handleMessageByType(packet.uuid, nextPacket, topic, 'time');
    const daily = (await client.query('SELECT * FROM thermostat_runtime_stats')).rows[0];
    assert.equal(Number(daily.cool_middle_runtime), 120);
    assert.equal(Number(daily.runtime_speed2), 120);
    assert.equal(Number((await client.query('SELECT COUNT(*) FROM thermostat_runtime_history')).rows[0].count), 3);

    const gateway = { ...device, id: '00000000-0000-4000-8000-000000000001', device_category: 'gateway' };
    const child = { ...device, id: '00000000-0000-4000-8000-000000000013', device_category: 'sub_device' };
    service.getDeviceWithCache = async () => gateway;
    models.Device.findOne = async options => {
      assert.equal(options.where.parent_device_id, gateway.id);
      assert.equal(options.where.sub_device_sequence, 13);
      return child;
    };
    const gatewayPacket = structuredClone(packet); gatewayPacket.body.id = [13];
    await service.handleMessageByType(packet.uuid, gatewayPacket, topic, 'time');
    assert.ok(logs.some(log => log.device_id === child.id && log.data.processingStatus === 'stored'));
    assert.equal(Number((await client.query('SELECT cool_high_runtime FROM thermostat_runtime_snapshots WHERE device_id=$1', [child.id])).rows[0].cool_high_runtime), 243133);

    service.getDeviceWithCache = async () => device;
    const originalSave = service.saveThermostatRuntimeStats;
    service.saveThermostatRuntimeStats = async () => { throw new Error('verify forced storage failure'); };
    await assert.rejects(service.handleMessageByType(packet.uuid, packet, topic, 'time'), /forced storage failure/);
    assert.equal(logs.at(-1).data.processingStatus, 'failed');
    assert.deepEqual(logs.at(-1).data.payload, packet);
    service.saveThermostatRuntimeStats = originalSave;
    await assert.rejects(service.handleMessageByType(packet.uuid, { ...packet, eCode: 1 }, topic, 'time'), /eCode=1/);
    assert.equal(logs.at(-1).data.processingStatus, 'failed');
    console.log('PASS: protocol mapping, real-schema storage, first baseline, daily delta, duplicate reply, gateway child routing, raw logs on storage/error response failure. All test writes rolled back.');
  } finally {
    Pool.prototype.connect = originalConnect;
    await client.query('ROLLBACK');
    client.release();
    await testPool.end();
  }
}

verify().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1); });
