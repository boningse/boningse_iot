const express = require('express');
const { Op } = require('sequelize');
const { ElectricMeter, Device, Tenant, Manufacturer, ProtocolConfig, User } = require('../models');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * 获取电表列表
 * GET /api/electric-meters
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 10,
      keyword,
      status,
      tenantId,
      manufacturerId,
      deviceId
    } = req.query;

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const where = {};

    // 根据用户角色过滤数据
    if (req.user.role !== 'admin') {
      where.tenant_id = req.user.tenant_id;
    } else if (tenantId) {
      where.tenant_id = tenantId;
    }

    // 关键字搜索
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { meter_number: { [Op.like]: `%${keyword}%` } },
        { meter_address: { [Op.like]: `%${keyword}%` } }
      ];
    }

    // 状态过滤
    if (status) {
      where.status = status;
    }

    // 厂商过滤
    if (manufacturerId) {
      where.manufacturer_id = manufacturerId;
    }

    // 设备过滤
    if (deviceId) {
      where.device_id = deviceId;
    }

    // 查询电表列表
    const { count, rows } = await ElectricMeter.findAndCountAll({
      where,
      include: [
        {
          model: Device,
          as: 'Device',
          attributes: ['id', 'name', 'imei', 'status']
        },
        {
          model: Device,
          as: 'DtuDevice',
          attributes: ['id', 'name', 'imei', 'status', 'device_category'],
          required: false
        },
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code']
        },
        {
          model: ProtocolConfig,
          as: 'protocol_config',
          attributes: ['id', 'name', 'version', 'description']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username']
        }
      ],
      order: [['created_at', 'DESC']],
      offset,
      limit
    });

    res.json({
      success: true,
      data: {
        list: rows,
        pagination: {
          total: count,
          page: parseInt(page),
          pageSize: limit,
          totalPages: Math.ceil(count / limit)
        }
      }
    });

  } catch (error) {
    console.error('获取电表列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取电表列表失败',
      error: error.message
    });
  }
});

/**
 * 获取电表详情
 * GET /api/electric-meters/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const electricMeter = await ElectricMeter.findByPk(id, {
      include: [
        {
          model: Device,
          as: 'Device',
          attributes: ['id', 'name', 'imei', 'status', 'location']
        },
        {
          model: Device,
          as: 'DtuDevice',
          attributes: ['id', 'name', 'imei', 'status', 'device_category', 'connection_config'],
          required: false
        },
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type', 'contact_person']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'description']
        },
        {
          model: ProtocolConfig,
          as: 'protocol_config',
          attributes: ['id', 'name', 'version', 'description', 'data_parsing_config', 'command_config']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        }
      ]
    });

    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && electricMeter.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该电表'
      });
    }

    res.json({
      success: true,
      data: electricMeter
    });

  } catch (error) {
    console.error('获取电表详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取电表详情失败',
      error: error.message
    });
  }
});

/**
 * 检查电表编号是否存在
 * GET /api/electric-meters/check-meter-number/:meterNumber
 */
router.get('/check-meter-number/:meterNumber', authenticateToken, async (req, res) => {
  try {
    const { meterNumber } = req.params;
    const { excludeId } = req.query; // 获取要排除的电表ID

    if (!meterNumber) {
      return res.status(400).json({
        success: false,
        message: '电表编号参数不能为空'
      });
    }

    // 构建查询条件
    const whereCondition = { meter_number: meterNumber };
    
    // 如果提供了excludeId，则排除该电表
    if (excludeId) {
      whereCondition.id = { [require('sequelize').Op.ne]: excludeId };
    }

    const existingMeter = await ElectricMeter.findOne({
      where: whereCondition
    });

    res.json({
      success: true,
      exists: !!existingMeter,
      message: existingMeter ? '电表编号已存在' : '电表编号可用'
    });
  } catch (error) {
    console.error('检查电表编号失败:', error);
    res.status(500).json({
      success: false,
      message: '检查电表编号失败',
      error: error.message
    });
  }
});

/**
 * 创建电表
 * POST /api/electric-meters
 */
router.post('/', authenticateToken, async (req, res) => {
  try {
    const {
      name,
      meter_address,
      device_id,
      tenant_id,
      manufacturer_id,
      protocol_config_id,
      description,
      collection_interval,
      dtu_device_id,
      meter_type
    } = req.body;

    // 验证必填字段
    if (!name || !meter_address || !device_id || !tenant_id) {
      return res.status(400).json({
        success: false,
        message: '电表名称、电表地址、设备和租户为必填项'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权为其他租户创建电表'
      });
    }

    // 获取设备信息以生成电表编号
    const device = await Device.findByPk(device_id);
    if (!device) {
      return res.status(400).json({
        success: false,
        message: '指定的设备不存在'
      });
    }

    // 如果指定了DTU设备，验证DTU设备是否存在且为网关类型
    if (dtu_device_id) {
      const dtuDevice = await Device.findOne({
        where: {
          id: dtu_device_id,
          device_category: 'gateway'
        }
      });
      
      if (!dtuDevice) {
        return res.status(400).json({
          success: false,
          message: '指定的DTU设备不存在或不是网关设备'
        });
      }
    }

    // 生成电表编号：IMEI + 电表地址号
    const meter_number = `${device.imei}${meter_address}`;

    // 检查电表编号是否已存在
    const existingMeter = await ElectricMeter.findOne({
      where: { meter_number }
    });

    if (existingMeter) {
      return res.status(400).json({
        success: false,
        message: '该电表编号已存在，请检查设备IMEI和电表地址号'
      });
    }

    // 创建电表
    const electricMeter = await ElectricMeter.create({
      name,
      meter_number,
      meter_address,
      device_id,
      tenant_id,
      manufacturer_id: manufacturer_id || null,
      protocol_config_id: protocol_config_id || null,
      description,
      collection_interval: collection_interval || 10,
      created_by: req.user.id,
      dtu_device_id: dtu_device_id || null,
      meter_type: meter_type || 'single_phase'
    });

    // 获取完整的电表信息
    const newElectricMeter = await ElectricMeter.findByPk(electricMeter.id, {
      include: [
        {
          model: Device,
          as: 'Device',
          attributes: ['id', 'name', 'imei', 'status']
        },
        {
          model: Device,
          as: 'DtuDevice',
          attributes: ['id', 'name', 'imei', 'status', 'device_category'],
          required: false
        },
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code']
        },
        {
          model: ProtocolConfig,
          as: 'protocol_config',
          attributes: ['id', 'name', 'version', 'description']
        }
      ]
    });

    // 重新加载设备配置以启动新电表的数据采集
    try {
      if (global.electricMeterMqttServiceInstance) {
        await global.electricMeterMqttServiceInstance.reloadDeviceConfig(device_id);
        logger.info(`电表创建成功，已重新加载设备 ${device_id} 的轮询配置`);
      }
    } catch (reloadError) {
      logger.warn('重新加载设备配置失败，但电表创建成功', { error: reloadError.message, deviceId: device_id });
    }

    res.status(201).json({
      success: true,
      message: '电表创建成功',
      data: newElectricMeter
    });

  } catch (error) {
    console.error('创建电表失败:', error);
    res.status(500).json({
      success: false,
      message: '创建电表失败',
      error: error.message
    });
  }
});

/**
 * 更新电表
 * PUT /api/electric-meters/:id
 */
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      meter_address,
      device_id,
      tenant_id,
      manufacturer_id,
      protocol_config_id,
      status,
      description,
      collection_interval,
      dtu_device_id,
      meter_type
    } = req.body;

    // 查找电表
    const electricMeter = await ElectricMeter.findByPk(id);
    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && electricMeter.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权修改该电表'
      });
    }

    // 如果指定了DTU设备，验证DTU设备是否存在且为网关类型
    if (dtu_device_id) {
      const dtuDevice = await Device.findOne({
        where: {
          id: dtu_device_id,
          device_category: 'gateway'
        }
      });
      
      if (!dtuDevice) {
        return res.status(400).json({
          success: false,
          message: '指定的DTU设备不存在或不是网关设备'
        });
      }
    }

    // 如果修改了设备或电表地址，需要重新生成电表编号
    let meter_number = electricMeter.meter_number;
    if (device_id && device_id !== electricMeter.device_id || 
        meter_address && meter_address !== electricMeter.meter_address) {
      
      const device = await Device.findByPk(device_id || electricMeter.device_id);
      if (!device) {
        return res.status(400).json({
          success: false,
          message: '指定的设备不存在'
        });
      }

      const newMeterNumber = `${device.imei}${meter_address || electricMeter.meter_address}`;
      
      // 检查新的电表编号是否已存在（排除当前电表）
      const existingMeter = await ElectricMeter.findOne({
        where: { 
          meter_number: newMeterNumber,
          id: { [Op.ne]: id }
        }
      });

      if (existingMeter) {
        return res.status(400).json({
          success: false,
          message: '该电表编号已存在，请检查设备IMEI和电表地址号'
        });
      }

      meter_number = newMeterNumber;
    }

    // 更新电表
    await electricMeter.update({
      name: name || electricMeter.name,
      meter_number,
      meter_address: meter_address || electricMeter.meter_address,
      device_id: device_id || electricMeter.device_id,
      tenant_id: tenant_id || electricMeter.tenant_id,
      manufacturer_id: manufacturer_id !== undefined ? manufacturer_id : electricMeter.manufacturer_id,
      protocol_config_id: protocol_config_id !== undefined ? protocol_config_id : electricMeter.protocol_config_id,
      status: status || electricMeter.status,
      description: description !== undefined ? description : electricMeter.description,
      collection_interval: collection_interval !== undefined ? collection_interval : electricMeter.collection_interval,
      dtu_device_id: dtu_device_id !== undefined ? dtu_device_id : electricMeter.dtu_device_id,
      meter_type: meter_type || electricMeter.meter_type
    });

    // 获取更新后的完整信息
    const updatedElectricMeter = await ElectricMeter.findByPk(id, {
      include: [
        {
          model: Device,
          as: 'Device',
          attributes: ['id', 'name', 'imei', 'status']
        },
        {
          model: Device,
          as: 'DtuDevice',
          attributes: ['id', 'name', 'imei', 'status', 'device_category'],
          required: false
        },
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code']
        },
        {
          model: ProtocolConfig,
          as: 'protocol_config',
          attributes: ['id', 'name', 'version', 'description']
        }
      ]
    });

    // 重新加载设备配置以应用电表的更新
    try {
      if (global.electricMeterMqttServiceInstance) {
        const targetDeviceId = device_id || electricMeter.device_id;
        await global.electricMeterMqttServiceInstance.reloadDeviceConfig(targetDeviceId);
        logger.info(`电表更新成功，已重新加载设备 ${targetDeviceId} 的轮询配置`);
      }
    } catch (reloadError) {
      logger.warn('重新加载设备配置失败，但电表更新成功', { error: reloadError.message, deviceId: device_id || electricMeter.device_id });
    }

    res.json({
      success: true,
      message: '电表更新成功',
      data: updatedElectricMeter
    });

  } catch (error) {
    console.error('更新电表失败:', error);
    res.status(500).json({
      success: false,
      message: '更新电表失败',
      error: error.message
    });
  }
});

/**
 * 删除电表
 * DELETE /api/electric-meters/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 查找电表
    const electricMeter = await ElectricMeter.findByPk(id);
    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && electricMeter.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权删除该电表'
      });
    }

    // 保存设备ID用于后续重新加载配置
    const deviceId = electricMeter.device_id;

    // 删除电表
    await electricMeter.destroy();

    // 重新加载设备配置以更新轮询状态
    try {
      if (global.electricMeterMqttServiceInstance) {
        await global.electricMeterMqttServiceInstance.reloadDeviceConfig(deviceId);
        logger.info(`电表删除成功，已重新加载设备 ${deviceId} 的轮询配置`);
      }
    } catch (reloadError) {
      logger.warn('重新加载设备配置失败，但电表删除成功', { error: reloadError.message, deviceId });
    }

    res.json({
      success: true,
      message: '电表删除成功'
    });

  } catch (error) {
    console.error('删除电表失败:', error);
    res.status(500).json({
      success: false,
      message: '删除电表失败',
      error: error.message
    });
  }
});

/**
 * 批量删除电表
 * DELETE /api/electric-meters
 */
router.delete('/', authenticateToken, async (req, res) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供要删除的电表ID列表'
      });
    }

    // 查找要删除的电表
    const electricMeters = await ElectricMeter.findAll({
      where: { id: { [Op.in]: ids } }
    });

    if (electricMeters.length === 0) {
      return res.status(404).json({
        success: false,
        message: '未找到要删除的电表'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin') {
      const unauthorizedMeters = electricMeters.filter(meter => meter.tenant_id !== req.user.tenant_id);
      if (unauthorizedMeters.length > 0) {
        return res.status(403).json({
          success: false,
          message: '无权删除部分电表'
        });
      }
    }

    // 收集需要重新加载配置的设备ID（去重）
    const deviceIds = [...new Set(electricMeters.map(meter => meter.device_id))];

    // 批量删除
    await ElectricMeter.destroy({
      where: { id: { [Op.in]: ids } }
    });

    // 重新加载相关设备的配置
    if (global.electricMeterMqttServiceInstance && deviceIds.length > 0) {
      for (const deviceId of deviceIds) {
        try {
          await global.electricMeterMqttServiceInstance.reloadDeviceConfig(deviceId);
          logger.info(`批量删除电表后，已重新加载设备 ${deviceId} 的轮询配置`);
        } catch (reloadError) {
          logger.warn('重新加载设备配置失败', { error: reloadError.message, deviceId });
        }
      }
    }

    res.json({
      success: true,
      message: `成功删除 ${electricMeters.length} 个电表`
    });

  } catch (error) {
    console.error('批量删除电表失败:', error);
    res.status(500).json({
      success: false,
      message: '批量删除电表失败',
      error: error.message
    });
  }
});

/**
 * 获取电表历史数据
 * GET /api/electric-meters/:id/history
 */
router.get('/:id/history', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      start_time,
      end_time,
      limit = 1000
    } = req.query;

    if (!start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: '请提供开始时间和结束时间'
      });
    }

    // 查找电表
    const electricMeter = await ElectricMeter.findByPk(id, {
      include: [{
        model: Device,
        as: 'Device',
        attributes: ['id', 'name', 'imei', 'tenant_id']
      }]
    });

    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查 - 临时注释用于测试
    // if (req.user.role !== 'admin' && electricMeter.Device?.tenant_id !== req.user.tenant_id) {
    //   return res.status(403).json({
    //     success: false,
    //     message: '无权访问该电表数据'
    //   });
    // }

    // 获取电表数据服务实例
    const electricMeterDataService = require('../services/electricMeterDataService');
    
    // 获取历史数据
    const historyData = await electricMeterDataService.getElectricMeterHistory(
      id,
      new Date(start_time),
      new Date(end_time),
      parseInt(limit)
    );

    res.json({
      success: true,
      data: historyData,
      message: '获取电表历史数据成功'
    });

  } catch (error) {
    console.error('获取电表历史数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取电表历史数据失败',
      error: error.message
    });
  }
});

/**
 * 获取电表实时数据
 * GET /api/electric-meters/:id/realtime
 */
router.get('/:id/realtime', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // 查找电表
    const electricMeter = await ElectricMeter.findByPk(id, {
      include: [{
        model: Device,
        as: 'Device',
        attributes: ['id', 'name', 'imei', 'tenant_id']
      }]
    });

    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && electricMeter.Device?.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该电表数据'
      });
    }

    // 获取电表数据服务实例
    const electricMeterDataService = require('../services/electricMeterDataService');
    
    // 获取实时数据
    const realtimeData = await electricMeterDataService.getElectricMeterRealTimeData(id);

    res.json({
      success: true,
      data: realtimeData,
      message: '获取电表实时数据成功'
    });

  } catch (error) {
    console.error('获取电表实时数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取电表实时数据失败',
      error: error.message
    });
  }
});

/**
 * 获取电表通信状态
 * GET /api/electric-meters/:id/communication-status
 */
router.get('/:id/communication-status', async (req, res) => {
  try {
    const { id } = req.params;

    // 查找电表
    const electricMeter = await ElectricMeter.findByPk(id, {
      include: [{
        model: Device,
        as: 'Device',
        attributes: ['id', 'name', 'imei', 'tenant_id', 'status', 'last_seen_at']
      }]
    });

    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && electricMeter.Device?.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该电表数据'
      });
    }

    // 获取电表数据服务实例
    const electricMeterDataService = require('../services/electricMeterDataService');
    
    // 获取通信状态
    const communicationStatus = await electricMeterDataService.getElectricMeterCommunicationStatus(id);

    res.json({
      success: true,
      data: communicationStatus,
      message: '获取电表通信状态成功'
    });

  } catch (error) {
    console.error('获取电表通信状态失败:', error);
    res.status(500).json({
      success: false,
      message: '获取电表通信状态失败',
      error: error.message
    });
  }
});

/**
 * 获取电表数据传输统计
 * GET /api/electric-meters/:id/transmission-stats
 */
router.get('/:id/transmission-stats', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '24h' } = req.query; // 支持 1h, 24h, 7d, 30d

    // 查找电表
    const electricMeter = await ElectricMeter.findByPk(id, {
      include: [{
        model: Device,
        as: 'Device',
        attributes: ['id', 'name', 'imei', 'tenant_id']
      }]
    });

    if (!electricMeter) {
      return res.status(404).json({
        success: false,
        message: '电表不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && electricMeter.Device?.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该电表数据'
      });
    }

    // 获取电表数据服务实例
    const electricMeterDataService = require('../services/electricMeterDataService');
    
    // 获取数据传输统计
    const transmissionStats = await electricMeterDataService.getElectricMeterTransmissionStats(id, period);

    res.json({
      success: true,
      data: transmissionStats,
      message: '获取电表数据传输统计成功'
    });

  } catch (error) {
    console.error('获取电表数据传输统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取电表数据传输统计失败',
      error: error.message
    });
  }
});

module.exports = router;