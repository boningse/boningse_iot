const db = require('../utils/database');
const logger = require('../utils/logger');
const mqttService = require('./mqttService');
const thermostatService = require('./thermostatService');

const SEND_SPACING_MS = 10;

class ThermostatRuntimePollingService {
  constructor() {
    this.isRunning = false;
  }

  async pollDueDevices() {
    if (this.isRunning || !mqttService.isConnected) return { skipped: true };
    this.isRunning = true;
    let requested = 0;
    let failed = 0;

    try {
      const { rows } = await db.query(`
        WITH eligible AS (
          SELECT
            d.id,
            CASE
              WHEN d.device_category = 'sub_device' AND parent.id IS NOT NULL THEN parent.id
              ELSE d.id
            END AS communication_device_id,
            GREATEST(
              COALESCE(snap.last_requested_at, 'epoch'::timestamptz),
              COALESCE(snap.last_received_at, 'epoch'::timestamptz)
            ) <= NOW() - GREATEST(
              COALESCE(NULLIF(pc.data_parsing_config->>'runtime_poll_interval_minutes', '')::integer, 30),
              1
            ) * INTERVAL '1 minute' AS is_due
          FROM devices d
          JOIN device_types dt ON dt.id = d.device_type_id
          LEFT JOIN devices parent ON parent.id = d.parent_device_id
          JOIN protocol_configs pc ON pc.id = COALESCE(d.protocol_config_id, parent.protocol_config_id)
          LEFT JOIN thermostat_runtime_snapshots snap ON snap.device_id = d.id
          WHERE dt.name = '空调温控器'
            AND d.is_thermostat = TRUE
            AND COALESCE(d.device_category, 'standalone') <> 'gateway'
            AND d.status = 'online'
            AND jsonb_typeof(pc.data_parsing_config->'time_mapping') = 'object'
            AND COALESCE(pc.command_config #> '{command_config,commands,read_runtime_time,template}',
                         pc.command_config #> '{commands,read_runtime_time,template}') IS NOT NULL
        )
        SELECT
          communication_device_id,
          ARRAY_AGG(id ORDER BY id) AS device_ids
        FROM eligible
        GROUP BY communication_device_id
        HAVING BOOL_OR(is_due)
        ORDER BY communication_device_id
      `);

      for (const row of rows) {
        try {
          const deviceIds = row.device_ids || [];
          if (deviceIds.length === 0) continue;
          const device = await thermostatService.getThermostatDevice(deviceIds[0]);
          if (!device) continue;

          const commands = thermostatService.getCommandConfigCommands(device.command_config);
          const readCommand = commands?.read_runtime_time;
          const timeMapping = device.data_parsing_config?.time_mapping;
          if (!readCommand?.template || !timeMapping || typeof timeMapping !== 'object') continue;

          const command = JSON.parse(JSON.stringify(readCommand.template));
          command.uuid = device.communication_imei || device.imei;
          command.body = command.body || {};
          // 协议 5.60 的 time/read 示例用空 id/items 表示读取全部内机的全部计时项。
          command.body.id = [];
          command.body.items = [];

          const topic = thermostatService.buildMqttTopic(device);
          await mqttService.publish(topic, command);
          await db.query(`
            INSERT INTO thermostat_runtime_snapshots (device_id, last_requested_at, updated_at)
            SELECT device_id, NOW(), NOW() FROM UNNEST($1::uuid[]) AS requested(device_id)
            ON CONFLICT (device_id) DO UPDATE SET
              last_requested_at = NOW(), updated_at = NOW()
          `, [deviceIds]);
          requested += 1;

          if (SEND_SPACING_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, SEND_SPACING_MS));
          }
        } catch (error) {
          failed += 1;
          logger.warn('定时读取温控器运行时间失败', {
            deviceId: row.communication_device_id,
            error: error.message
          });
        }
      }

      if (requested || failed) {
        logger.info('温控器累计运行时间巡检完成', { requested, failed, due: rows.length });
      }
      return { requested, failed, due: rows.length };
    } catch (error) {
      logger.error('温控器累计运行时间定时巡检失败', { error: error.message });
      return { requested, failed: failed + 1, error: error.message };
    } finally {
      this.isRunning = false;
    }
  }
}

module.exports = new ThermostatRuntimePollingService();
