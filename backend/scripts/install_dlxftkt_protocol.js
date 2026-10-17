const fs = require('node:fs');
const path = require('node:path');
const protocol = require('../config/protocols/dlxftkt-sacm6-v2.01.json');
const db = require('../utils/database');
const backupDirectory = '/mnt/data1/iot-uploads/protocol-dlxftkt-20261017-0911';

const saveBackup = (name, value) => {
  fs.mkdirSync(backupDirectory, { recursive: true });
  const target = path.join(backupDirectory, name);
  if (!fs.existsSync(target)) fs.writeFileSync(target, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
};

const install = async () => db.transaction(async (client) => {
  const manufacturer = await client.query(
    'SELECT code, mqtt_config FROM manufacturers WHERE code = $1 FOR UPDATE',
    [protocol.manufacturer_code]
  );
  if (!manufacturer.rowCount) throw new Error(`厂商不存在: ${protocol.manufacturer_code}`);

  const mqttConfig = manufacturer.rows[0].mqtt_config || {};
  saveBackup('manufacturer-mqtt-config-before.json', mqttConfig);
  const responseTopic = 'tsrv/SACM6/{imei}';
  const commandTopic = 'tcli/SACM6/{imei}';
  const publishTopics = Array.isArray(mqttConfig.publishTopics) ? [...mqttConfig.publishTopics] : [];
  if (!publishTopics.some((item) => (typeof item === 'string' ? item : item?.topic) === responseTopic)) {
    publishTopics.push({ topic: responseTopic, enabled: true, description: '设备回包（按现场实报确认）' });
  }
  const subscribeTopics = Array.isArray(mqttConfig.subscribeTopics) ? [...mqttConfig.subscribeTopics] : [];
  if (!subscribeTopics.some((item) => (typeof item === 'string' ? item : item?.topic) === commandTopic)) {
    subscribeTopics.push({ topic: commandTopic, enabled: true, description: '设备命令下发' });
  }
  await client.query(
    'UPDATE manufacturers SET mqtt_config = $1::jsonb, updated_at = CURRENT_TIMESTAMP WHERE code = $2',
    [JSON.stringify({
      ...mqttConfig,
      publishTopic: responseTopic,
      subscribeTopic: commandTopic,
      publishTopics,
      subscribeTopics
    }), protocol.manufacturer_code]
  );

  const existing = await client.query(
    'SELECT * FROM protocol_configs WHERE manufacturer_code = $1 AND name = $2 FOR UPDATE',
    [protocol.manufacturer_code, protocol.name]
  );
  if (existing.rowCount) saveBackup('protocol-config-before-adjustment.json', existing.rows[0]);

  if (existing.rowCount) {
    const updated = await client.query(
      `UPDATE protocol_configs SET version = $1, protocol_type = $2, device_type = $3,
         description = $4, data_parsing_config = $5::jsonb, command_config = $6::jsonb,
         validation_rules = $7::jsonb, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8 RETURNING id, name, version, status`,
      [
        protocol.version, protocol.protocol_type, protocol.device_type, protocol.description,
        JSON.stringify(protocol.data_parsing_config), JSON.stringify(protocol.command_config),
        JSON.stringify(protocol.validation_rules), existing.rows[0].id
      ]
    );
    return { action: 'updated', ...updated.rows[0] };
  }

  const admin = await client.query("SELECT id FROM users WHERE username = 'admin' ORDER BY created_at LIMIT 1");
  if (!admin.rowCount) throw new Error('找不到 admin 创建人，未写入协议');

  const inserted = await client.query(
    `INSERT INTO protocol_configs (
       name, version, protocol_type, manufacturer_code, device_type, description,
       data_parsing_config, command_config, validation_rules,
       status, is_default, created_by, tenant_id, is_global
     ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb,
       'active', false, $10, NULL, true)
     RETURNING id, name, version, status`,
    [
      protocol.name, protocol.version, protocol.protocol_type,
      protocol.manufacturer_code, protocol.device_type, protocol.description,
      JSON.stringify(protocol.data_parsing_config),
      JSON.stringify(protocol.command_config),
      JSON.stringify(protocol.validation_rules),
      admin.rows[0].id
    ]
  );
  return { action: 'created', ...inserted.rows[0] };
});

if (require.main === module) {
  install()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    })
    .finally(() => db.pool.end());
}

module.exports = { install };
