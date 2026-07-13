const { Pool } = require('pg');
const logger = require('../utils/logger');
const mqttService = require('./mqttService');
const moment = require('moment');
const { getPoolConfig } = require('../config/database');

// 创建数据库连接池
const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.TIMER_DB_POOL_MAX, 10) || 5,
  min: parseInt(process.env.TIMER_DB_POOL_MIN, 10) || 0
});

/**
 * 检查并执行照明设备定时任务
 */
async function checkAndExecuteLightingTimers() {
  try {
    const now = moment();
    const currentTime = now.format('HH:mm:00');
    const currentDayOfWeek = now.format('dddd').toLowerCase();
    
    logger.debug(`检查照明设备定时任务: ${currentTime}, ${currentDayOfWeek}`);
    
    // 查询当前时间需要执行的定时任务
    const query = `
      SELECT * FROM lighting_device_timers
      WHERE time = $1
      AND enabled = true
    `;
    
    const result = await pool.query(query, [currentTime]);
    
    if (result.rows.length === 0) {
      return;
    }
    
    logger.info(`找到 ${result.rows.length} 个需要执行的照明设备定时任务`);
    
    // 执行每个定时任务
    for (const timer of result.rows) {
      try {
        // 检查是否需要在当前日期执行
        const repeat = timer.repeat || [];
        
        // 如果重复数组为空或包含当前星期几，则执行
        if (repeat.length === 0 || repeat.includes(currentDayOfWeek)) {
          await executeTimerAction(timer);
        }
      } catch (error) {
        logger.error(`执行照明设备定时任务失败 ID: ${timer.id}:`, error);
      }
    }
  } catch (error) {
    logger.error('检查照明设备定时任务失败:', error);
  }
}

/**
 * 执行定时任务动作
 * @param {Object} timer 定时任务对象
 */
async function executeTimerAction(timer) {
  try {
    const { device_id, action } = timer;
    
    logger.info(`执行照明设备定时任务: 设备 ${device_id}, 动作 ${action}`);
    
    // 构建MQTT消息
    const message = {
      deviceId: device_id,
      status: action === 'on' ? true : false,
      timestamp: new Date().toISOString()
    };
    
    // 发送MQTT消息控制设备
    await mqttService.publishLightingControl(device_id, message);
    
    // 记录执行日志
    await logTimerExecution(timer.id, true);
    
    logger.info(`照明设备定时任务执行成功: ID ${timer.id}`);
  } catch (error) {
    logger.error(`执行照明设备定时任务动作失败 ID: ${timer.id}:`, error);
    await logTimerExecution(timer.id, false, error.message);
    throw error;
  }
}

/**
 * 记录定时任务执行日志
 * @param {Number} timerId 定时任务ID
 * @param {Boolean} success 是否成功
 * @param {String} errorMessage 错误信息
 */
async function logTimerExecution(timerId, success, errorMessage = null) {
  try {
    const query = `
      INSERT INTO lighting_timer_logs
      (timer_id, success, error_message)
      VALUES ($1, $2, $3)
    `;
    
    await pool.query(query, [timerId, success, errorMessage]);
  } catch (error) {
    logger.error(`记录照明设备定时任务执行日志失败:`, error);
  }
}

// 导出模块
module.exports = {
  checkAndExecuteLightingTimers
};
