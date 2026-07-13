const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');

const router = express.Router();

// 数据库连接 - 使用统一的配置
const pool = new Pool(getPoolConfig());

// 获取所有情景模式列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { scene_type } = req.query; // 可选：筛选情景类型

    let query = `
      SELECT 
        id,
        scene_name,
        scene_description,
        scene_type,
        enable_timer,
        start_time,
        end_time,
        repeat_days,
        devices_config,
        is_active,
        created_at,
        updated_at
      FROM lighting_scenes 
      WHERE tenant_id = $1
    `;

    const params = [tenant_id];

    if (scene_type) {
      query += ' AND scene_type = $2';
      params.push(scene_type);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    logger.error('获取情景模式列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取情景模式列表失败',
      error: error.message
    });
  }
});

// 获取单个情景模式详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;

    const query = `
      SELECT 
        id,
        scene_name,
        scene_description,
        scene_type,
        enable_timer,
        start_time,
        end_time,
        repeat_days,
        devices_config,
        is_active,
        created_at,
        updated_at
      FROM lighting_scenes 
      WHERE id = $1 AND tenant_id = $2
    `;

    const result = await pool.query(query, [id, tenant_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '情景模式不存在'
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('获取情景模式详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取情景模式详情失败',
      error: error.message
    });
  }
});

// 创建新的情景模式
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { tenant_id, id: user_id } = req.user;
    const {
      scene_name,
      scene_description,
      scene_type = 'custom',
      enable_timer = false,
      start_time,
      end_time,
      repeat_days = [],
      devices_config
    } = req.body;

    // 验证必填字段
    if (!scene_name || !scene_name.trim()) {
      return res.status(400).json({
        success: false,
        message: '情景名称不能为空'
      });
    }

    if (!devices_config || !Array.isArray(devices_config) || devices_config.length === 0) {
      return res.status(400).json({
        success: false,
        message: '设备配置不能为空'
      });
    }

    // 验证定时设置
    if (enable_timer) {
      if (!end_time) {
        return res.status(400).json({
          success: false,
          message: '启用定时功能时，关闭时间为必填项'
        });
      }

      if (!repeat_days || repeat_days.length === 0) {
        return res.status(400).json({
          success: false,
          message: '启用定时功能时，重复日期不能为空'
        });
      }
    }

    const query = `
      INSERT INTO lighting_scenes (
        tenant_id,
        scene_name,
        scene_description,
        scene_type,
        enable_timer,
        start_time,
        end_time,
        repeat_days,
        devices_config,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;

    const result = await pool.query(query, [
      tenant_id,
      scene_name.trim(),
      scene_description || null,
      scene_type,
      enable_timer,
      start_time || null,
      end_time || null,
      repeat_days,
      JSON.stringify(devices_config),
      user_id
    ]);

    logger.info('情景模式创建成功', {
      sceneId: result.rows[0].id,
      sceneName: scene_name,
      tenantId: tenant_id,
      userId: user_id
    });

    // 通过WebSocket推送情景模式创建通知
    const websocketService = require('../services/websocketService');
    websocketService.broadcastToClients('lighting_scene_created', {
      sceneId: result.rows[0].id,
      sceneName: scene_name,
      tenantId: tenant_id,
      data: result.rows[0]
    });

    res.status(201).json({
      success: true,
      message: '情景模式创建成功',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('创建情景模式失败:', error);
    res.status(500).json({
      success: false,
      message: '创建情景模式失败',
      error: error.message
    });
  }
});

// 更新情景模式
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    const {
      scene_name,
      scene_description,
      enable_timer,
      start_time,
      end_time,
      repeat_days,
      devices_config
    } = req.body;

    // 验证情景模式是否存在
    const checkQuery = 'SELECT id FROM lighting_scenes WHERE id = $1 AND tenant_id = $2';
    const checkResult = await pool.query(checkQuery, [id, tenant_id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '情景模式不存在'
      });
    }

    // 验证必填字段
    if (!scene_name || !scene_name.trim()) {
      return res.status(400).json({
        success: false,
        message: '情景名称不能为空'
      });
    }

    if (!devices_config || !Array.isArray(devices_config) || devices_config.length === 0) {
      return res.status(400).json({
        success: false,
        message: '设备配置不能为空'
      });
    }

    // 验证定时设置
    if (enable_timer) {
      if (!end_time) {
        return res.status(400).json({
          success: false,
          message: '启用定时功能时，关闭时间为必填项'
        });
      }

      if (!repeat_days || repeat_days.length === 0) {
        return res.status(400).json({
          success: false,
          message: '启用定时功能时，重复日期不能为空'
        });
      }
    }

    const query = `
      UPDATE lighting_scenes SET
        scene_name = $1,
        scene_description = $2,
        enable_timer = $3,
        start_time = $4,
        end_time = $5,
        repeat_days = $6,
        devices_config = $7,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $8 AND tenant_id = $9
      RETURNING *
    `;

    const result = await pool.query(query, [
      scene_name.trim(),
      scene_description || null,
      enable_timer,
      start_time || null,
      end_time || null,
      repeat_days || [],
      JSON.stringify(devices_config),
      id,
      tenant_id
    ]);

    logger.info('情景模式更新成功', {
      sceneId: id,
      sceneName: scene_name,
      tenantId: tenant_id
    });

    // 通过WebSocket推送情景模式更新通知
    const websocketService = require('../services/websocketService');
    websocketService.broadcastToClients('lighting_scene_updated', {
      sceneId: id,
      sceneName: scene_name,
      tenantId: tenant_id,
      data: result.rows[0]
    });

    res.json({
      success: true,
      message: '情景模式更新成功',
      data: result.rows[0]
    });
  } catch (error) {
    logger.error('更新情景模式失败:', error);
    res.status(500).json({
      success: false,
      message: '更新情景模式失败',
      error: error.message
    });
  }
});

// 删除情景模式（硬删除）
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;

    // 验证情景模式是否存在
    const checkQuery = 'SELECT id, scene_name FROM lighting_scenes WHERE id = $1 AND tenant_id = $2';
    const checkResult = await pool.query(checkQuery, [id, tenant_id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '情景模式不存在'
      });
    }

    const query = `
      DELETE FROM lighting_scenes
      WHERE id = $1 AND tenant_id = $2
    `;

    await pool.query(query, [id, tenant_id]);

    logger.info('情景模式删除成功', {
      sceneId: id,
      sceneName: checkResult.rows[0].scene_name,
      tenantId: tenant_id
    });

    // 通过WebSocket推送情景模式删除通知
    const websocketService = require('../services/websocketService');
    websocketService.broadcastToClients('lighting_scene_deleted', {
      sceneId: id,
      sceneName: checkResult.rows[0].scene_name,
      tenantId: tenant_id
    });

    res.json({
      success: true,
      message: '情景模式删除成功'
    });
  } catch (error) {
    logger.error('删除情景模式失败:', error);
    res.status(500).json({
      success: false,
      message: '删除情景模式失败',
      error: error.message
    });
  }
});

// 执行情景模式
router.post('/:id/execute', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;

    // 获取情景模式配置
    const sceneQuery = `
      SELECT 
        scene_name,
        devices_config
      FROM lighting_scenes 
      WHERE id = $1 AND tenant_id = $2
    `;

    const sceneResult = await pool.query(sceneQuery, [id, tenant_id]);

    if (sceneResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '情景模式不存在'
      });
    }

    const scene = sceneResult.rows[0];
    const devicesConfig = scene.devices_config;

    // 执行实际的设备控制逻辑
    const mqttService = require('../services/mqttService');
    const executionResults = [];

    for (const deviceConfig of devicesConfig) {
      try {
        const { deviceId, type, config, name } = deviceConfig;

        if (!deviceId || !config) {
          logger.warn('设备配置不完整，跳过', { deviceConfig });
          continue;
        }

        // 直接使用配置中的控制指令，并添加type字段
        const command = {
          type: 'event',
          ...config
        };

        // 通过MQTT发送控制指令到设备
        await mqttService.sendCommandToDevice(deviceId, command);
        executionResults.push({
          deviceId,
          name,
          type,
          status: 'success',
          command
        });

        logger.info('设备控制指令发送成功', {
          deviceId,
          name,
          type,
          command
        });
      } catch (deviceError) {
        logger.error('设备控制失败', {
          deviceConfig,
          error: deviceError.message
        });
        executionResults.push({
          deviceId: deviceConfig.deviceId,
          name: deviceConfig.name,
          type: deviceConfig.type,
          status: 'failed',
          error: deviceError.message
        });
      }
    }

    logger.info('情景模式执行完成', {
      sceneId: id,
      sceneName: scene.scene_name,
      devicesCount: devicesConfig.length,
      successCount: executionResults.filter(r => r.status === 'success').length,
      failedCount: executionResults.filter(r => r.status === 'failed').length,
      tenantId: tenant_id
    });

    // 通过WebSocket推送设备状态更新通知
    const websocketService = require('../services/websocketService');
    
    // 为每个成功执行的设备发送状态更新事件
    for (const result of executionResults) {
      if (result.status === 'success') {
        try {
          // 查询设备信息获取IMEI
          const deviceQuery = `
            SELECT imei, device_id
            FROM devices 
            WHERE device_id = $1
          `;
          
          const deviceResult = await pool.query(deviceQuery, [result.deviceId]);
          
          if (deviceResult.rows.length > 0) {
            const deviceInfo = deviceResult.rows[0];
            
            // 构造设备状态更新数据，使用IMEI作为deviceId
            const statusUpdate = {
              deviceId: deviceInfo.imei || deviceInfo.device_id, // 使用IMEI作为deviceId，与前端保持一致
              switches: { ...result.command } // 使用发送的命令作为新状态
            };
            
            // 移除type字段，只保留开关状态
            delete statusUpdate.switches.type;
            
            websocketService.broadcastToClients('lighting_switch_status', statusUpdate);
            
            logger.info('发送设备状态更新WebSocket事件', {
              deviceId: statusUpdate.deviceId,
              switches: statusUpdate.switches
            });
          } else {
            logger.warn('未找到设备信息，无法发送WebSocket状态更新', {
              deviceId: result.deviceId
            });
          }
        } catch (error) {
          logger.error('查询设备信息失败，无法发送WebSocket状态更新', {
            deviceId: result.deviceId,
            error: error.message
          });
        }
      }
    }

    res.json({
      success: true,
      message: `情景模式 "${scene.scene_name}" 执行完成`,
      data: {
        sceneId: id,
        sceneName: scene.scene_name,
        devicesCount: devicesConfig.length,
        successCount: executionResults.filter(r => r.status === 'success').length,
        failedCount: executionResults.filter(r => r.status === 'failed').length,
        executionResults
      }
    });
  } catch (error) {
    logger.error('执行情景模式失败:', error);
    res.status(500).json({
      success: false,
      message: '执行情景模式失败',
      error: error.message
    });
  }
});

module.exports = router;