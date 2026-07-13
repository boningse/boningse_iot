const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');

// 创建数据库连接池
const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.TIMER_ROUTE_DB_POOL_MAX, 10) || 5,
  min: parseInt(process.env.TIMER_ROUTE_DB_POOL_MIN, 10) || 0
});

/**
 * @api {post} /api/lighting-timer 创建照明设备定时
 * @apiDescription 创建新的照明设备定时设置
 * @apiName CreateLightingTimer
 * @apiGroup LightingTimer
 * 
 * @apiParam {String} deviceId 设备ID
 * @apiParam {String} deviceImei 设备IMEI
 * @apiParam {String} action 动作类型 (on/off)
 * @apiParam {String} time 执行时间 (HH:MM)
 * @apiParam {Array} repeat 重复日期
 * @apiParam {Boolean} enabled 是否启用
 * @apiParam {String} name 定时名称
 * 
 * @apiSuccess {Boolean} success 是否成功
 * @apiSuccess {Object} data 创建的定时数据
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { deviceId, action, time, repeat, enabled, name } = req.body;
    
    if (!deviceId || !action || !time) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    const query = `
      INSERT INTO lighting_device_timers 
      (device_id, name, action, time, repeat, enabled)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      deviceId,
      name || `${deviceId} ${action === 'on' ? '开启' : '关闭'} ${time}`,
      action,
      time,
      repeat || [],
      enabled !== undefined ? enabled : true
    ]);
    
    if (result.rows.length > 0) {
      logger.info(`创建照明设备定时成功: ${deviceId}, ${action}, ${time}`);
      return res.json({
        success: true,
        data: result.rows[0]
      });
    } else {
      throw new Error('创建定时失败');
    }
  } catch (error) {
    logger.error('创建照明设备定时失败:', error);
    return res.status(500).json({
      success: false,
      message: `创建定时失败: ${error.message}`
    });
  }
});

/**
 * @api {get} /api/lighting-timer/:deviceId 获取照明设备定时列表
 * @apiDescription 获取指定设备的所有定时设置
 * @apiName GetLightingTimers
 * @apiGroup LightingTimer
 * 
 * @apiParam {String} deviceId 设备IMEI
 * 
 * @apiSuccess {Boolean} success 是否成功
 * @apiSuccess {Array} data 定时列表
 */
router.get('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: '缺少设备ID'
      });
    }
    
    const query = `
      SELECT * FROM lighting_device_timers
      WHERE device_id = $1
      ORDER BY time
    `;
    
    const result = await pool.query(query, [deviceId]);
    
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('获取照明设备定时列表失败:', error);
    return res.status(500).json({
      success: false,
      message: `获取定时列表失败: ${error.message}`
    });
  }
});

/**
 * @api {put} /api/lighting-timer/:id/toggle 切换定时状态
 * @apiDescription 启用或禁用定时设置
 * @apiName ToggleLightingTimer
 * @apiGroup LightingTimer
 * 
 * @apiParam {Number} id 定时ID
 * @apiParam {Boolean} enabled 是否启用
 * 
 * @apiSuccess {Boolean} success 是否成功
 */
router.put('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { enabled } = req.body;
    
    if (enabled === undefined) {
      return res.status(400).json({
        success: false,
        message: '缺少启用状态参数'
      });
    }
    
    const query = `
      UPDATE lighting_device_timers
      SET enabled = $1
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [enabled, id]);
    
    if (result.rows.length > 0) {
      logger.info(`更新照明设备定时状态成功: ID ${id}, 状态: ${enabled}`);
      return res.json({
        success: true,
        data: result.rows[0]
      });
    } else {
      return res.status(404).json({
        success: false,
        message: '未找到指定定时'
      });
    }
  } catch (error) {
    logger.error('更新照明设备定时状态失败:', error);
    return res.status(500).json({
      success: false,
      message: `更新定时状态失败: ${error.message}`
    });
  }
});

/**
 * @api {delete} /api/lighting-timer/:id 删除定时
 * @apiDescription 删除指定的定时设置
 * @apiName DeleteLightingTimer
 * @apiGroup LightingTimer
 * 
 * @apiParam {Number} id 定时ID
 * 
 * @apiSuccess {Boolean} success 是否成功
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const query = `
      DELETE FROM lighting_device_timers
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [id]);
    
    if (result.rows.length > 0) {
      logger.info(`删除照明设备定时成功: ID ${id}`);
      return res.json({
        success: true,
        message: '定时已删除'
      });
    } else {
      return res.status(404).json({
        success: false,
        message: '未找到指定定时'
      });
    }
  } catch (error) {
    logger.error('删除照明设备定时失败:', error);
    return res.status(500).json({
      success: false,
      message: `删除定时失败: ${error.message}`
    });
  }
});

module.exports = router;
