const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const {
  buildConfiguredCommand,
  parseConfiguredUplink
} = require('../utils/configuredModbusProtocol');

const pool = new Pool(getPoolConfig());

async function main() {
  const deviceResult = await pool.query(
    `SELECT d.*, pc.name AS protocol_name, pc.data_parsing_config, pc.command_config,
            status.power_status, status.mode, status.fan_speed,
            status.target_temperature, status.current_temperature, status.humidity
       FROM control_device_assignments assignment
       JOIN devices d ON d.id = assignment.device_id
       JOIN protocol_configs pc ON pc.id = d.protocol_config_id
  LEFT JOIN air_conditioner_latest_status status ON status.device_id = d.id
      WHERE assignment.module_type = $1 AND assignment.is_active = true
      LIMIT 1`,
    ['air_conditioner']
  );
  if (!deviceResult.rows.length) throw new Error('没有可验证的空调设备');
  const device = deviceResult.rows[0];
  const rawResult = await pool.query(
    `SELECT data->'payload' AS payload
       FROM device_logs
      WHERE device_id = $1
        AND data->'payload'->>'data' IS NOT NULL
        AND length(data->'payload'->>'data') > 20
      ORDER BY created_at DESC
      LIMIT 1`,
    [device.id]
  );
  if (!rawResult.rows.length) throw new Error('没有可验证的设备上报报文');
  const decoded = parseConfiguredUplink(rawResult.rows[0].payload, device.data_parsing_config);
  if (decoded.current === undefined || decoded.energy === undefined) {
    throw new Error('配置驱动上报解析未得到电流和电量');
  }

  const commands = [
    { action: 'set_power', power_state: 1 },
    { action: 'set_power', power_state: 0 },
    { action: 'set_infrared_output_mode', infrared_output_mode: 'parallel' },
    { action: 'set_power', power_state: 1, mode: 'cool', target_temperature: 26, fan_speed: 'auto' },
    { action: 'set_power', power_state: 1, mode: 'heat', target_temperature: 22, fan_speed: 'auto' },
    { action: 'set_infrared_output_mode', infrared_output_mode: 'intervention' }
  ];
  const encoded = commands.map((command) => {
    const result = buildConfiguredCommand(command, device, device.command_config);
    return {
      action: command.action,
      protocol_command: result.command_name,
      hex: result.hex,
      mqtt_payload: result.mqtt_payload
    };
  });
  console.log(JSON.stringify({
    protocol: device.protocol_name,
    decoded: { current: decoded.current, energy: decoded.energy },
    encoded
  }, null, 2));
}

main()
  .then(() => pool.end())
  .catch(async (error) => {
    console.error(error.message);
    await pool.end();
    process.exit(1);
  });
