/**
 * Modbus 设备管理路由
 * 提供 Modbus 设备的连接、数据读取、命令执行等 API
 */

const express = require('express');
const router = express.Router();
const ModbusProtocolManager = require('../services/modbusProtocolManager');
const { Device, ProtocolConfig, DeviceData, DeviceCommand } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

// 创建 Modbus 协议管理器实例
const modbusManager = new ModbusProtocolManager();

/**
 * @route GET /api/modbus/devices
 * @desc 获取所有 Modbus 设备列表
 * @access Private
 */
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const devices = await Device.findAll({
      include: [
        {
          model: ProtocolConfig,
          where: {
            name: {
              [require('sequelize').Op.iLike]: '%modbus%'
            }
          }
        }
      ],
      where: {
        tenant_id: req.user.tenant_id
      }
    });

    // 获取设备连接状态
    const devicesWithStatus = devices.map(device => {
      const status = modbusManager.getDeviceStatus(device.id);
      return {
        ...device.toJSON(),
        connection_status: status
      };
    });

    res.json({
      success: true,
      data: devicesWithStatus
    });
  } catch (error) {
    logger.error('Error fetching Modbus devices:', error);
    res.status(500).json({
      success: false,
      message: '获取 Modbus 设备列表失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/modbus/devices/:deviceId/connect
 * @desc 连接 Modbus 设备
 * @access Private
 */
router.post('/devices/:deviceId/connect', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 获取设备信息
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      },
      include: [ProtocolConfig]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    if (!device.ProtocolConfig) {
      return res.status(400).json({
        success: false,
        message: '设备未配置协议'
      });
    }

    // 初始化设备连接
    await modbusManager.initializeDevice(device, device.ProtocolConfig);

    res.json({
      success: true,
      message: '设备连接成功',
      data: {
        device_id: device.id,
        status: modbusManager.getDeviceStatus(device.id)
      }
    });
  } catch (error) {
    logger.error(`Error connecting Modbus device ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '设备连接失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/modbus/devices/:deviceId/disconnect
 * @desc 断开 Modbus 设备连接
 * @access Private
 */
router.post('/devices/:deviceId/disconnect', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 验证设备权限
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 断开设备连接
    await modbusManager.disconnectDevice(parseInt(deviceId));

    res.json({
      success: true,
      message: '设备断开连接成功'
    });
  } catch (error) {
    logger.error(`Error disconnecting Modbus device ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '设备断开连接失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/modbus/devices/:deviceId/status
 * @desc 获取 Modbus 设备状态
 * @access Private
 */
router.get('/devices/:deviceId/status', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 验证设备权限
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    const status = modbusManager.getDeviceStatus(parseInt(deviceId));

    res.json({
      success: true,
      data: {
        device_id: deviceId,
        device_name: device.name,
        ...status
      }
    });
  } catch (error) {
    logger.error(`Error getting Modbus device status ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '获取设备状态失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/modbus/devices/:deviceId/read
 * @desc 手动读取 Modbus 设备数据
 * @access Private
 */
router.post('/devices/:deviceId/read', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    // 验证设备权限
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 读取设备数据
    const deviceData = await modbusManager.readDeviceData(deviceId);

    res.json({
      success: true,
      message: '数据读取成功',
      data: deviceData
    });
  } catch (error) {
    logger.error(`Error reading Modbus device data ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '数据读取失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/modbus/devices/:deviceId/command
 * @desc 执行 Modbus 设备命令
 * @access Private
 */
router.post('/devices/:deviceId/command', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { command_name, value, options = {} } = req.body;
    
    if (!command_name) {
      return res.status(400).json({
        success: false,
        message: '命令名称不能为空'
      });
    }

    // 验证设备权限
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 执行命令
    const result = await modbusManager.executeCommand(
      parseInt(deviceId),
      command_name,
      value,
      {
        ...options,
        userId: req.user.id
      }
    );

    res.json({
      success: true,
      message: '命令执行成功',
      data: {
        command_name,
        value,
        result
      }
    });
  } catch (error) {
    logger.error(`Error executing Modbus command for device ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '命令执行失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/modbus/devices/:deviceId/data
 * @desc 获取 Modbus 设备历史数据
 * @access Private
 */
router.get('/devices/:deviceId/data', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { start_time, end_time, limit = 100, offset = 0 } = req.query;
    
    // 验证设备权限
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 构建查询条件
    const whereClause = { device_id: deviceId };
    
    if (start_time || end_time) {
      whereClause.timestamp = {};
      if (start_time) {
        whereClause.timestamp[require('sequelize').Op.gte] = new Date(start_time);
      }
      if (end_time) {
        whereClause.timestamp[require('sequelize').Op.lte] = new Date(end_time);
      }
    }

    // 查询数据
    const { count, rows } = await DeviceData.findAndCountAll({
      where: whereClause,
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        total: count,
        data: rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: count
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching Modbus device data ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '获取设备数据失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/modbus/devices/:deviceId/commands
 * @desc 获取 Modbus 设备命令历史
 * @access Private
 */
router.get('/devices/:deviceId/commands', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // 验证设备权限
    const device = await Device.findOne({
      where: {
        id: deviceId,
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 查询命令历史
    const { count, rows } = await DeviceCommand.findAndCountAll({
      where: { device_id: deviceId },
      order: [['executed_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        total: count,
        commands: rows,
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          total: count
        }
      }
    });
  } catch (error) {
    logger.error(`Error fetching Modbus device commands ${req.params.deviceId}:`, error);
    res.status(500).json({
      success: false,
      message: '获取命令历史失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/modbus/status
 * @desc 获取 Modbus 管理器状态
 * @access Private
 */
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const connectedDevices = modbusManager.getConnectedDevices();
    
    res.json({
      success: true,
      data: {
        connected_devices_count: connectedDevices.length,
        connected_devices: connectedDevices,
        manager_status: 'running'
      }
    });
  } catch (error) {
    logger.error('Error getting Modbus manager status:', error);
    res.status(500).json({
      success: false,
      message: '获取管理器状态失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/modbus/test-connection
 * @desc 测试 Modbus 连接
 * @access Private
 */
router.post('/test-connection', authenticateToken, async (req, res) => {
  try {
    const { host, port = 502, unitId = 1, timeout = 5000 } = req.body;
    
    if (!host) {
      return res.status(400).json({
        success: false,
        message: '主机地址不能为空'
      });
    }

    const ModbusService = require('../services/modbusService');
    const testService = new ModbusService({
      host,
      port: parseInt(port),
      unitId: parseInt(unitId),
      timeout: parseInt(timeout)
    });

    // 测试连接
    await testService.connect();
    
    // 尝试读取一个寄存器来验证通信
    try {
      await testService.readHoldingRegisters(0, 1);
    } catch (readError) {
      // 读取失败不一定意味着连接失败，可能是地址不存在
      logger.warn('Test read failed, but connection might be OK:', readError.message);
    }
    
    await testService.disconnect();

    res.json({
      success: true,
      message: '连接测试成功',
      data: {
        host,
        port,
        unitId,
        status: 'connected'
      }
    });
  } catch (error) {
    logger.error('Modbus connection test failed:', error);
    res.status(500).json({
      success: false,
      message: '连接测试失败',
      error: error.message
    });
  }
});

// 导出路由和管理器实例
module.exports = {
  router,
  modbusManager
};