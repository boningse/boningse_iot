const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');
const { executeAirConditionerControl } = require('./airConditionerExecutor');

const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.AIR_SCHEDULE_DB_POOL_MAX, 10) || 5,
  min: 0
});

const buildCommand = (schedule) => {
  if (schedule.action === 'power_off') {
    return { action: 'set_power', power_state: 0 };
  }
  if (schedule.action === 'power_on') {
    return {
      action: 'set_power',
      power_state: 1,
      mode: schedule.mode,
      fan_speed: schedule.fan_speed,
      target_temperature: schedule.target_temperature
    };
  }
  return {
    action: 'set_temperature',
    mode: schedule.mode,
    fan_speed: schedule.fan_speed,
    target_temperature: schedule.target_temperature
  };
};

const checkAndExecuteAirConditionerSchedules = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT schedule.*, strategy.enabled AS strategy_enabled,
             d.imei, d.device_id AS device_code, d.name, d.manufacturer_code,
             status.power_status, status.mode, status.fan_speed,
             status.target_temperature, status.current_temperature, status.humidity
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
        await executeAirConditionerControl(schedule, buildCommand(schedule));
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
