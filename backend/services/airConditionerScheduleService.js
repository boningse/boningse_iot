const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');
const { executeAirConditionerControl } = require('./airConditionerExecutor');

const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.AIR_SCHEDULE_DB_POOL_MAX, 10) || 5,
  min: 0
});

const buildCommands = (schedule) => {
  const commands = [];
  if (schedule.action === 'power_off') {
    commands.push({ action: 'set_power', power_state: 0 });
  } else if (schedule.action === 'power_on') {
    commands.push({
      action: 'set_power',
      power_state: 1,
      mode: schedule.mode,
      fan_speed: schedule.fan_speed,
      target_temperature: schedule.target_temperature
    });
  } else if (schedule.action === 'temperature') {
    commands.push({
      action: 'set_temperature',
      mode: schedule.mode,
      fan_speed: schedule.fan_speed,
      target_temperature: schedule.target_temperature
    });
  }
  if (schedule.remote_permission_mode === 'intervention' || schedule.remote_permission_mode === 'parallel') {
    commands.push({
      action: 'set_infrared_output_mode',
      infrared_output_mode: schedule.remote_permission_mode
    });
  }
  return commands;
};

const checkAndExecuteAirConditionerSchedules = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT schedule.*, strategy.enabled AS strategy_enabled,
             d.imei, d.device_id AS device_code, d.name AS device_name, d.manufacturer_code, d.protocol_config_id,
             d.tenant_id AS device_tenant_id,
             status.power_status AS current_power_status,
             status.mode AS current_mode,
             status.fan_speed AS current_fan_speed,
             status.target_temperature AS current_target_temperature,
             status.current_temperature,
             status.humidity
      FROM air_conditioner_schedules schedule
      JOIN air_conditioner_strategies strategy ON strategy.id = schedule.strategy_id
      JOIN devices d ON d.id = schedule.device_id
      JOIN control_device_assignments assignment
        ON assignment.device_id = d.id
       AND assignment.module_type = 'air_conditioner'
       AND assignment.is_active = true
      LEFT JOIN air_conditioner_latest_status status ON status.device_id = d.id
      WHERE schedule.enabled = true
        AND strategy.enabled = true
        AND schedule.execute_time = LOCALTIME(0)
        AND (
          schedule.repeat_type = 'once'
          OR schedule.repeat_type = 'daily'
          OR (
            schedule.repeat_type = 'weekly'
            AND EXTRACT(DOW FROM CURRENT_DATE)::smallint = ANY(schedule.repeat_days)
          )
          OR (
            schedule.repeat_type = 'custom'
            AND CURRENT_DATE = ANY(schedule.custom_dates)
          )
        )
        AND (
          schedule.last_executed_at IS NULL
          OR schedule.last_executed_at < date_trunc('minute', CURRENT_TIMESTAMP)
        )
      FOR UPDATE OF schedule SKIP LOCKED
    `);

    for (const schedule of result.rows) {
      let success = true;
      let errorMessage = null;
      try {
        const device = {
          id: schedule.device_id,
          tenant_id: schedule.device_tenant_id,
          imei: schedule.imei,
          device_code: schedule.device_code,
          name: schedule.device_name,
          manufacturer_code: schedule.manufacturer_code,
          protocol_config_id: schedule.protocol_config_id,
          power_status: schedule.current_power_status,
          mode: schedule.current_mode,
          fan_speed: schedule.current_fan_speed,
          target_temperature: schedule.current_target_temperature,
          current_temperature: schedule.current_temperature,
          humidity: schedule.humidity
        };
        const commands = buildCommands(schedule);
        if (!commands.length) throw new Error('空调策略未配置执行内容');
        for (const command of commands) {
          await executeAirConditionerControl(device, command);
        }
      } catch (error) {
        success = false;
        errorMessage = error.message;
        logger.error('执行空调定时策略失败', { scheduleId: schedule.id, error: error.message });
      }
      await client.query(
        `INSERT INTO air_conditioner_schedule_logs
           (schedule_id, device_id, success, error_message)
         VALUES ($1, $2, $3, $4)`,
        [schedule.id, schedule.device_id, success, errorMessage]
      );
      await client.query(
        `UPDATE air_conditioner_schedules
         SET last_executed_at = CURRENT_TIMESTAMP,
             enabled = CASE WHEN repeat_type = 'once' AND $2 THEN false ELSE enabled END,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [schedule.id, success]
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('检查空调定时策略失败', { error: error.message });
  } finally {
    client.release();
  }
};

module.exports = {
  checkAndExecuteAirConditionerSchedules
};
