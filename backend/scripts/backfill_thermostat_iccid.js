const mqtt = require('mqtt');
const { sequelize } = require('../config/database');
const mqttConfigService = require('../services/mqttConfigService');
require('dotenv').config();

const delay = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));

const getCommands = (commandConfig) => (
  commandConfig?.command_config?.commands || commandConfig?.commands || null
);

const connectMqtt = () => new Promise((resolve, reject) => {
  const client = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: `thermostat_iccid_backfill_${Date.now()}`,
    clean: true,
    connectTimeout: 15000,
    reconnectPeriod: 0
  });
  const timer = setTimeout(() => reject(new Error('MQTT连接超时')), 16000);
  client.once('connect', () => {
    clearTimeout(timer);
    resolve(client);
  });
  client.once('error', error => {
    clearTimeout(timer);
    reject(error);
  });
});

const publish = (client, topic, payload) => new Promise((resolve, reject) => {
  client.publish(topic, JSON.stringify(payload), { qos: 1 }, error => (
    error ? reject(error) : resolve()
  ));
});

const main = async () => {
  const [devices] = await sequelize.query(`
    WITH physical_devices AS (
      SELECT DISTINCT COALESCE(d.parent_device_id, d.id) AS physical_id
      FROM devices d
      JOIN device_types dt ON dt.id = d.device_type_id
      WHERE d.is_thermostat = true
        AND dt.name = '空调温控器'
        AND COALESCE(d.device_category, 'standalone') <> 'gateway'
    )
    SELECT d.id, d.device_id, d.imei, d.mqtt_config,
           m.code AS manufacturer_code, m.subscription_type, m.mqtt_config AS manufacturer_mqtt_config,
           pc.command_config
    FROM physical_devices pd
    JOIN devices d ON d.id = pd.physical_id
    LEFT JOIN manufacturers m ON m.code = d.manufacturer_code
    LEFT JOIN protocol_configs pc ON pc.id = d.protocol_config_id
    WHERE d.iccid IS NULL
      AND d.iccid_requested_at IS NULL
      AND d.imei IS NOT NULL
    ORDER BY d.id
  `);

  if (devices.length === 0) {
    console.log(JSON.stringify({ candidates: 0, requested: 0, failed: 0 }));
    return;
  }

  const client = await connectMqtt();
  let requested = 0;
  let failed = 0;

  for (const device of devices) {
    const readProperty = getCommands(device.command_config)?.read_property;
    if (!readProperty?.template) {
      failed += 1;
      continue;
    }

    const [, claim] = await sequelize.query(`
      UPDATE devices
      SET iccid_requested_at = NOW(), updated_at = NOW()
      WHERE id = :id AND iccid IS NULL AND iccid_requested_at IS NULL
    `, { replacements: { id: device.id } });
    if (!claim?.rowCount) continue;

    try {
      const mqttConfig = mqttConfigService.buildDeviceConfig({
        device_id: device.device_id,
        imei: device.imei,
        mqtt_config: device.mqtt_config || {},
        manufacturer: {
          code: device.manufacturer_code,
          subscription_type: device.subscription_type,
          mqtt_config: device.manufacturer_mqtt_config || {}
        }
      });
      const topic = mqttConfig.subscribe_topics?.[0]?.topic;
      if (!topic) throw new Error('缺少控制主题');

      const command = JSON.parse(JSON.stringify(readProperty.template));
      command.uuid = device.imei;
      await publish(client, topic, command);
      requested += 1;
      // 控制发送速率，避免一次性查询大量设备时给MQTT代理造成突发压力。
      await delay(50);
    } catch (error) {
      failed += 1;
      await sequelize.query(`
        UPDATE devices SET iccid_requested_at = NULL
        WHERE id = :id AND iccid IS NULL
      `, { replacements: { id: device.id } });
    }
  }

  client.end(false);
  await delay(6000);
  const [summaryRows] = await sequelize.query(`
    WITH physical_devices AS (
      SELECT DISTINCT COALESCE(d.parent_device_id, d.id) AS physical_id
      FROM devices d
      JOIN device_types dt ON dt.id = d.device_type_id
      WHERE d.is_thermostat = true
        AND dt.name = '空调温控器'
        AND COALESCE(d.device_category, 'standalone') <> 'gateway'
    )
    SELECT COUNT(*) FILTER (WHERE d.iccid IS NOT NULL) AS saved,
           COUNT(*) FILTER (WHERE d.iccid IS NULL AND d.iccid_requested_at IS NOT NULL) AS awaiting,
           COUNT(*) AS total
    FROM physical_devices pd
    JOIN devices d ON d.id = pd.physical_id
  `);
  console.log(JSON.stringify({ candidates: devices.length, requested, failed, ...summaryRows[0] }));
};

main()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
