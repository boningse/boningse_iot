const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');
const { executeSwitchControl } = require('./switchControlExecutor');

const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.SWITCH_SCHEDULE_DB_POOL_MAX, 10) || 5,
  min: 0
});

const checkAndExecuteSwitchSchedules = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query(`
      SELECT schedule.*, d.imei, d.device_id AS device_code, d.name,
             d.manufacturer_code, d.connection_config, pc.command_config
      FROM switch_control_schedules schedule
      JOIN devices d ON d.id = schedule.device_id
      JOIN control_device_assignments assignment
        ON assignment.device_id = d.id
       AND assignment.module_type = 'switch'
       AND assignment.is_active = true
      LEFT JOIN protocol_configs pc ON pc.id = d.protocol_config_id
      WHERE schedule.enabled = true
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
        await executeSwitchControl(schedule, {
          type: 'event',
          power_status: schedule.action === 'on'
        });
      } catch (error) {
        success = false;
        errorMessage = error.message;
        logger.error('执行开关策略失败', { scheduleId: schedule.id, error: error.message });
      }
      await client.query(
        `INSERT INTO switch_control_schedule_logs
           (schedule_id, device_id, success, error_message)
         VALUES ($1, $2, $3, $4)`,
        [schedule.id, schedule.device_id, success, errorMessage]
      );
      await client.query(
        `UPDATE switch_control_schedules
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
    logger.error('检查开关控制策略失败', { error: error.message });
  } finally {
    client.release();
  }
};

module.exports = {
  checkAndExecuteSwitchSchedules
};
