/**
 * 电表MQTT服务路由
 * 提供电表MQTT数据管理的API接口
 */

const express = require('express');
const { Device, ElectricMeter, ProtocolConfig } = require('../models');
const logger = require('../utils/logger');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

/**
 * 手动触发设备的电表数据查询
 */
router.post('/devices/:deviceId/poll', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
      return res.status(503).json({
        success: false,
        message: '电表MQTT服务未初始化'
      });
    }

    // 查找设备及其电表
    const device = await Device.findByPk(deviceId, {
      include: [{
        model: ElectricMeter,
        as: 'electric_meters',
        where: { status: 'active' },
        include: [{
          model: ProtocolConfig,
          as: 'protocol_config',
          where: { 
            protocol_type: 'modbus',
            status: 'active' 
          }
        }]
      }]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    if (!device.electric_meters || device.electric_meters.length === 0) {
      return res.status(400).json({
        success: false,
        message: '设备没有配置电表'
      });
    }

    // 手动触发轮询
    await devicePollingService.pollDeviceElectricMeters(device);

    res.json({
      success: true,
      message: '电表数据查询已触发',
      data: {
        deviceId: device.id,
        deviceName: device.name,
        meterCount: device.electric_meters.length
      }
    });

  } catch (error) {
    logger.error('手动触发电表数据查询失败:', error);
    res.status(500).json({
      success: false,
      message: '触发电表数据查询失败',
      error: error.message
    });
  }
});

/**
 * 手动触发单个电表数据查询
 */
router.post('/electric-meters/:meterId/poll', authenticateToken, async (req, res) => {
  try {
    const { meterId } = req.params;
    
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
    return res.status(503).json({
      success: false,
      message: '设备轮询服务未初始化'
    });
  }

    // 查找电表及其设备
    const electricMeter = await ElectricMeter.findByPk(meterId, {
      include: [
        {
          model: Device,
          as: 'device'
        },
        {
          model: ProtocolConfig,
          as: 'protocol_config',
          where: { 
            protocol_type: 'modbus',
            status: 'active' 
          }
        }
      ],
      where: { status: 'active' }
    });

    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在或未激活'
      });
    }

    if (!electricMeter.device) {
      return res.status(400).json({
        success: false,
        message: '电表未关联设备'
      });
    }

    // 手动触发单个电表轮询
    await devicePollingService.pollSingleElectricMeter(electricMeter.device, electricMeter);

    res.json({
      success: true,
      message: '电表数据查询已触发',
      data: {
        meterId: electricMeter.id,
        meterNumber: electricMeter.meter_number,
        meterAddress: electricMeter.meter_address,
        deviceId: electricMeter.device.id,
        deviceName: electricMeter.device.name
      }
    });

  } catch (error) {
    logger.error('手动触发单个电表数据查询失败:', error);
    res.status(500).json({
      success: false,
      message: '触发电表数据查询失败',
      error: error.message
    });
  }
});

/**
 * 重新启动设备的电表轮询
 */
router.post('/devices/:deviceId/restart-polling', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
    return res.status(503).json({
      success: false,
      message: '设备轮询服务未初始化'
    });
  }

    // 重新加载设备配置
    await devicePollingService.reloadDeviceConfig(deviceId);

    res.json({
      success: true,
      message: '设备电表轮询已重新启动',
      data: {
        deviceId: deviceId
      }
    });

  } catch (error) {
    logger.error('重新启动设备电表轮询失败:', error);
    res.status(500).json({
      success: false,
      message: '重新启动电表轮询失败',
      error: error.message
    });
  }
});

/**
 * 停止设备的电表轮询
 */
router.post('/devices/:deviceId/stop-polling', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
    return res.status(503).json({
      success: false,
      message: '设备轮询服务未初始化'
    });
  }

    // 停止设备轮询
    devicePollingService.stopDevicePolling(`${deviceId}`);

    res.json({
      success: true,
      message: '设备电表轮询已停止',
      data: {
        deviceId: deviceId
      }
    });

  } catch (error) {
    logger.error('停止设备电表轮询失败:', error);
    res.status(500).json({
      success: false,
      message: '停止电表轮询失败',
      error: error.message
    });
  }
});

/**
 * 获取电表MQTT服务状态
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
    return res.status(503).json({
      success: false,
      message: '设备轮询服务未初始化'
    });
  }

    // 获取服务状态
    const status = {
      serviceInitialized: !!devicePollingService,
    mqttConnected: devicePollingService.mqttService?.isConnected || false,
    activePollingDevices: devicePollingService.pollingIntervals.size,
    cachedDevices: devicePollingService.deviceElectricMeters.size
    };

    res.json({
      success: true,
      message: '电表MQTT服务状态获取成功',
      data: status
    });

  } catch (error) {
    logger.error('获取电表MQTT服务状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取服务状态失败',
      error: error.message
    });
  }
});

/**
 * 获取设备的电表轮询状态
 */
router.get('/devices/:deviceId/polling-status', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
    return res.status(503).json({
      success: false,
      message: '设备轮询服务未初始化'
    });
  }

    const deviceKey = `${deviceId}`;
    const isPolling = devicePollingService.pollingIntervals.has(deviceKey);
  const cachedMeters = devicePollingService.deviceElectricMeters.get(deviceKey);

    res.json({
      success: true,
      message: '设备电表轮询状态获取成功',
      data: {
        deviceId: deviceId,
        isPolling: isPolling,
        meterCount: cachedMeters ? cachedMeters.length : 0,
        meters: cachedMeters ? cachedMeters.map(meter => ({
          id: meter.id,
          meterNumber: meter.meter_number,
          meterAddress: meter.meter_address
        })) : []
      }
    });

  } catch (error) {
    logger.error('获取设备电表轮询状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取轮询状态失败',
      error: error.message
    });
  }
});

/**
 * 重新启动所有设备的电表轮询
 */
router.post('/restart-all-polling', authenticateToken, async (req, res) => {
  try {
    // 获取电表MQTT服务实例
    const devicePollingService = global.devicePollingServiceInstance;
  if (!devicePollingService) {
    return res.status(503).json({
      success: false,
      message: '设备轮询服务未初始化'
    });
  }

    // 停止所有轮询
    devicePollingService.stopAllPolling();

  // 重新启动轮询
  await devicePollingService.startAllDevicePolling();

    res.json({
      success: true,
      message: '所有设备电表轮询已重新启动'
    });

  } catch (error) {
    logger.error('重新启动所有电表轮询失败:', error);
    res.status(500).json({
      success: false,
      message: '重新启动所有电表轮询失败',
      error: error.message
    });
  }
});

module.exports = router;