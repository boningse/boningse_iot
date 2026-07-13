const express = require('express');
const router = express.Router();
const { Device, ElectricMeter, DeviceData } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

/**
 * @route GET /api/dtu/devices
 * @desc 获取DTU设备列表
 * @access Private
 */
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;

    const whereClause = {
      device_category: 'gateway',
      tenant_id: req.user.tenant_id
    };

    if (status) {
      whereClause.status = status;
    }

    if (search) {
      whereClause[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { device_id: { [Op.iLike]: `%${search}%` } },
        { imei: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Device.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Device,
          as: 'SubDevices',
          required: false
        },
        {
          model: ElectricMeter,
          as: 'electric_meters',
          required: false,
          where: { dtu_device_id: { [Op.col]: 'Device.id' } }
        }
      ],
      limit: parseInt(limit),
      offset: offset,
      order: [['created_at', 'DESC']]
    });

    const dtuDevices = rows.map(device => {
      const dtuInfo = global.dtuGatewayServiceInstance?.getDtuDevices()
        .find(dtu => dtu.device.id === device.id);
      
      return {
        id: device.id,
        name: device.name,
        device_id: device.device_id,
        imei: device.imei,
        manufacturer_code: device.manufacturer_code,
        status: device.status,
        last_seen_at: device.last_seen_at,
        connection_config: device.connection_config,
        sub_device_count: device.SubDevices?.length || 0,
        electric_meter_count: device.electric_meters?.length || 0,
        is_online: dtuInfo?.isOnline || false,
        last_communication: dtuInfo?.lastSeen || null
      };
    });

    res.json({
      success: true,
      data: {
        devices: dtuDevices,
        pagination: {
          current_page: parseInt(page),
          total_pages: Math.ceil(count / limit),
          total_count: count,
          per_page: parseInt(limit)
        }
      }
    });
  } catch (error) {
    logger.error('获取DTU设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取DTU设备列表失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/dtu/devices/:id
 * @desc 获取DTU设备详情
 * @access Private
 */
router.get('/devices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findOne({
      where: {
        id: id,
        device_category: 'gateway',
        tenant_id: req.user.tenant_id
      },
      include: [
        {
          model: Device,
          as: 'SubDevices',
          required: false
        },
        {
          model: ElectricMeter,
          as: 'electric_meters',
          required: false,
          where: { dtu_device_id: id },
          include: [{
            model: Device,
            as: 'Device'
          }]
        }
      ]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'DTU设备不存在'
      });
    }

    const dtuInfo = global.dtuGatewayServiceInstance?.getDtuDevices()
      .find(dtu => dtu.device.id === device.id);

    res.json({
      success: true,
      data: {
        id: device.id,
        name: device.name,
        device_id: device.device_id,
        imei: device.imei,
        manufacturer_code: device.manufacturer_code,
        status: device.status,
        last_seen_at: device.last_seen_at,
        connection_config: device.connection_config,
        sub_devices: device.SubDevices || [],
        electric_meters: device.electric_meters || [],
        is_online: dtuInfo?.isOnline || false,
        last_communication: dtuInfo?.lastSeen || null
      }
    });
  } catch (error) {
    logger.error('获取DTU设备详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取DTU设备详情失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/dtu/devices
 * @desc 创建DTU设备
 * @access Private
 */
router.post('/devices', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      device_id,
      imei,
      manufacturer_code,
      description,
      location,
      device_type_id,
      connection_config
    } = req.body;

    // 验证必填字段
    if (!name || !device_id || !imei || !manufacturer_code || !device_type_id) {
      return res.status(400).json({
        success: false,
        message: '缺少必填字段'
      });
    }

    // 检查IMEI是否已存在
    const existingDevice = await Device.findOne({
      where: { imei: imei }
    });

    if (existingDevice) {
      return res.status(400).json({
        success: false,
        message: 'IMEI已存在'
      });
    }

    const device = await Device.create({
      name,
      device_id,
      imei,
      manufacturer_code,
      description,
      location,
      device_category: 'gateway',
      status: 'offline',
      tenant_id: req.user.tenant_id,
      device_type_id,
      created_by: req.user.id,
      connection_config: connection_config || {
        type: 'mqtt',
        mqtt: {
          subscribe_topics: [`zhhl/${manufacturer_code}/${imei}/publish`],
          publish_topics: [`zhhl/${manufacturer_code}/${imei}/command`],
          heartbeat_interval: 60,
          offline_timeout: 300
        },
        modbus: {
          protocol: 'rtu',
          baud_rate: 9600,
          data_bits: 8,
          stop_bits: 1,
          parity: 'none'
        }
      }
    });

    logger.info(`DTU设备创建成功: ${device.name} (${device.imei})`);

    res.status(201).json({
      success: true,
      message: 'DTU设备创建成功',
      data: device
    });
  } catch (error) {
    logger.error('创建DTU设备失败:', error);
    res.status(500).json({
      success: false,
      message: '创建DTU设备失败',
      error: error.message
    });
  }
});

/**
 * @route PUT /api/dtu/devices/:id
 * @desc 更新DTU设备
 * @access Private
 */
router.put('/devices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const device = await Device.findOne({
      where: {
        id: id,
        device_category: 'gateway',
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'DTU设备不存在'
      });
    }

    // 不允许修改某些关键字段
    delete updateData.id;
    delete updateData.device_category;
    delete updateData.tenant_id;
    delete updateData.created_by;

    await device.update(updateData);

    logger.info(`DTU设备更新成功: ${device.name} (${device.imei})`);

    res.json({
      success: true,
      message: 'DTU设备更新成功',
      data: device
    });
  } catch (error) {
    logger.error('更新DTU设备失败:', error);
    res.status(500).json({
      success: false,
      message: '更新DTU设备失败',
      error: error.message
    });
  }
});

/**
 * @route DELETE /api/dtu/devices/:id
 * @desc 删除DTU设备
 * @access Private
 */
router.delete('/devices/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findOne({
      where: {
        id: id,
        device_category: 'gateway',
        tenant_id: req.user.tenant_id
      },
      include: [
        {
          model: Device,
          as: 'SubDevices',
          required: false
        },
        {
          model: ElectricMeter,
          as: 'electric_meters',
          required: false,
          where: { dtu_device_id: id }
        }
      ]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'DTU设备不存在'
      });
    }

    // 检查是否有关联的子设备或电表
    if (device.SubDevices?.length > 0 || device.electric_meters?.length > 0) {
      return res.status(400).json({
        success: false,
        message: '无法删除DTU设备，存在关联的子设备或电表'
      });
    }

    await device.destroy();

    logger.info(`DTU设备删除成功: ${device.name} (${device.imei})`);

    res.json({
      success: true,
      message: 'DTU设备删除成功'
    });
  } catch (error) {
    logger.error('删除DTU设备失败:', error);
    res.status(500).json({
      success: false,
      message: '删除DTU设备失败',
      error: error.message
    });
  }
});

/**
 * @route POST /api/dtu/devices/:id/command
 * @desc 向DTU发送Modbus命令
 * @access Private
 */
router.post('/devices/:id/command', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { meter_address, function_code, address, value } = req.body;

    const device = await Device.findOne({
      where: {
        id: id,
        device_category: 'gateway',
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'DTU设备不存在'
      });
    }

    if (!global.dtuGatewayServiceInstance) {
      return res.status(503).json({
        success: false,
        message: 'DTU网关服务未启动'
      });
    }

    const commandId = await global.dtuGatewayServiceInstance.sendModbusCommand(
      device.imei,
      meter_address,
      {
        function_code,
        address,
        value
      }
    );

    res.json({
      success: true,
      message: 'Modbus命令发送成功',
      data: {
        command_id: commandId,
        dtu_imei: device.imei,
        meter_address,
        command: { function_code, address, value }
      }
    });
  } catch (error) {
    logger.error('发送Modbus命令失败:', error);
    res.status(500).json({
      success: false,
      message: '发送Modbus命令失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/dtu/devices/:id/electric-meters
 * @desc 获取DTU下的电表列表
 * @access Private
 */
router.get('/devices/:id/electric-meters', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findOne({
      where: {
        id: id,
        device_category: 'gateway',
        tenant_id: req.user.tenant_id
      }
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: 'DTU设备不存在'
      });
    }

    const electricMeters = await ElectricMeter.findAll({
      where: {
        dtu_device_id: id,
        tenant_id: req.user.tenant_id
      },
      include: [
        {
          model: Device,
          as: 'Device'
        }
      ],
      order: [['meter_address', 'ASC']]
    });

    res.json({
      success: true,
      data: electricMeters
    });
  } catch (error) {
    logger.error('获取DTU电表列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取DTU电表列表失败',
      error: error.message
    });
  }
});

/**
 * @route GET /api/dtu/statistics
 * @desc 获取DTU统计信息
 * @access Private
 */
router.get('/statistics', authenticateToken, async (req, res) => {
  try {
    const tenantId = req.user.tenant_id;

    // 统计DTU设备数量
    const totalDtuCount = await Device.count({
      where: {
        device_category: 'gateway',
        tenant_id: tenantId
      }
    });

    const onlineDtuCount = await Device.count({
      where: {
        device_category: 'gateway',
        tenant_id: tenantId,
        status: 'online'
      }
    });

    // 统计电表数量
    const totalMeterCount = await ElectricMeter.count({
      where: {
        tenant_id: tenantId,
        dtu_device_id: { [Op.not]: null }
      }
    });

    const activeMeterCount = await ElectricMeter.count({
      where: {
        tenant_id: tenantId,
        dtu_device_id: { [Op.not]: null },
        status: 'active'
      }
    });

    // 统计今日数据量
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayDataCount = await DeviceData.count({
      where: {
        data_type: 'electric_meter',
        timestamp: {
          [Op.gte]: today
        }
      },
      include: [
        {
          model: Device,
          where: {
            tenant_id: tenantId
          }
        }
      ]
    });

    res.json({
      success: true,
      data: {
        dtu_statistics: {
          total_count: totalDtuCount,
          online_count: onlineDtuCount,
          offline_count: totalDtuCount - onlineDtuCount,
          online_rate: totalDtuCount > 0 ? ((onlineDtuCount / totalDtuCount) * 100).toFixed(2) : 0
        },
        meter_statistics: {
          total_count: totalMeterCount,
          active_count: activeMeterCount,
          inactive_count: totalMeterCount - activeMeterCount
        },
        data_statistics: {
          today_data_count: todayDataCount
        }
      }
    });
  } catch (error) {
    logger.error('获取DTU统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '获取DTU统计信息失败',
      error: error.message
    });
  }
});

module.exports = router;