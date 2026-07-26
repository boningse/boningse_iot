const express = require('express');
const { Op } = require('sequelize');
const { ProtocolConfig, Manufacturer, User, ElectricMeter, Device } = require('../models');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();
const canManageProtocol = (user) => user?.role === 'admin';

const requireProtocolManager = (req, res, next) => {
  if (!canManageProtocol(req.user)) {
    return res.status(403).json({ success: false, message: '无权限管理协议配置' });
  }
  next();
};

const ensureTenantAccess = (req, protocolConfig, res) => {
  return true;
};

const validateRequiredFields = ({ name, manufacturer_code, device_type }, res) => {
  if (!name) {
    res.status(400).json({ success: false, message: '协议名称不能为空' });
    return false;
  }
  if (!manufacturer_code) {
    res.status(400).json({ success: false, message: '厂商不能为空' });
    return false;
  }
  if (!device_type) {
    res.status(400).json({ success: false, message: '设备类型不能为空' });
    return false;
  }
  return true;
};

// 获取协议配置列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, pageSize = 10, keyword, manufacturerCode, deviceType, status } = req.query;
    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    const where = {};
    
    if (keyword) {
      where[Op.or] = [
        { name: { [Op.like]: `%${keyword}%` } },
        { description: { [Op.like]: `%${keyword}%` } }
      ];
    }
    if (manufacturerCode) where.manufacturer_code = manufacturerCode;
    if (deviceType) where.device_type = deviceType;
    if (status) where.status = status;

    const { count, rows } = await ProtocolConfig.findAndCountAll({
      where,
      include: [
        { model: Manufacturer, as: 'manufacturer', attributes: ['id', 'code', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'username'] }
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
    console.error('获取协议配置列表失败:', error);
    res.status(500).json({ success: false, message: '获取协议配置列表失败', error: error.message });
  }
});

// 获取协议配置模板示例
router.get('/template/example', authenticateToken, async (req, res) => {
  try {
    const template = {
      data_parsing_config: {
        fields: [
          { name: 'current_temperature', type: 'float', unit: '°C', description: '当前温度', path: 'data.currentTemp' },
          { name: 'target_temperature', type: 'float', unit: '°C', description: '设定温度', path: 'data.setTemp' },
          { name: 'power_state', type: 'boolean', description: '开关状态', path: 'data.power' },
          { name: 'energy', type: 'float', unit: 'kWh', description: '用电量', path: 'data.energy' }
        ],
        format: 'json'
      },
      command_config: {
        commands: [
          { name: 'turn_on', description: '开机/合闸', payload: { action: 'on' } },
          { name: 'turn_off', description: '关机/分闸', payload: { action: 'off' } },
          { name: 'set_temperature', description: '设置温度', payload: { action: 'set_temperature', value: '{temperature}' } },
          { name: 'read_energy', description: '读取用电量', payload: { action: 'read_energy' } }
        ]
      },
      validation_rules: {
        required_fields: ['device_id', 'timestamp'],
        data_types: {
          current_temperature: 'number',
          target_temperature: 'number',
          power_state: 'boolean',
          energy: 'number'
        }
      }
    };

    res.json({ success: true, data: template });
  } catch (error) {
    console.error('获取协议配置模板失败:', error);
    res.status(500).json({ success: false, message: '获取协议配置模板失败', error: error.message });
  }
});

// 获取协议配置详情
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const protocolConfig = await ProtocolConfig.findByPk(req.params.id, {
      include: [
        { model: Manufacturer, as: 'manufacturer', attributes: ['id', 'code', 'name'] },
        { model: User, as: 'creator', attributes: ['id', 'username'] }
      ]
    });

    if (!protocolConfig) {
      return res.status(404).json({ success: false, message: '协议配置不存在' });
    }

    if (!ensureTenantAccess(req, protocolConfig, res)) return;

    res.json({ success: true, data: protocolConfig });
  } catch (error) {
    console.error('获取协议配置详情失败:', error);
    res.status(500).json({ success: false, message: '获取协议配置详情失败', error: error.message });
  }
});

// 创建协议配置
router.post('/', authenticateToken, requireProtocolManager, async (req, res) => {
  try {
    const {
      name,
      version,
      protocol_type,
      manufacturer_code,
      device_type,
      description,
      data_parsing_config,
      command_config,
      validation_rules,
      modbus_config,
      modbus_registers,
      is_default
    } = req.body;
    if (!validateRequiredFields({ name, manufacturer_code, device_type }, res)) return;

    // 协议配置为全局可用资源，不再按租户隔离。
    const existingConfig = await ProtocolConfig.findOne({
      where: { name, manufacturer_code, device_type }
    });

    if (existingConfig) {
      return res.status(400).json({ success: false, message: '该厂商和设备类型的协议配置已存在' });
    }

    if (is_default) {
      await ProtocolConfig.update(
        { is_default: false },
        { where: { manufacturer_code, device_type, is_default: true } }
      );
    }

    const protocolConfig = await ProtocolConfig.create({
      name,
      version,
      protocol_type: protocol_type || 'json',
      manufacturer_code,
      device_type,
      description,
      data_parsing_config: data_parsing_config || {},
      command_config: command_config || {},
      validation_rules: validation_rules || {},
      modbus_config: modbus_config || {},
      modbus_registers: modbus_registers || [],
      is_default: is_default || false,
      status: 'active',
      tenant_id: null,
      is_global: true,
      created_by: req.user.id
    });

    // 协议配置创建成功后，触发热更新
    try {
      await triggerProtocolConfigHotReload(protocolConfig.id, 'created');
    } catch (hotReloadError) {
      console.warn('协议配置热更新失败，但协议配置已创建成功:', hotReloadError.message);
    }

    res.status(201).json({ success: true, data: protocolConfig });
  } catch (error) {
    console.error('创建协议配置失败:', error);
    res.status(500).json({ success: false, message: '创建协议配置失败', error: error.message });
  }
});

// 更新协议配置
router.put('/:id', authenticateToken, requireProtocolManager, async (req, res) => {
  try {
    const protocolConfig = await ProtocolConfig.findByPk(req.params.id);
    if (!protocolConfig) {
      return res.status(404).json({ success: false, message: '协议配置不存在' });
    }

    if (!ensureTenantAccess(req, protocolConfig, res)) return;

    const {
      name,
      version,
      protocol_type,
      manufacturer_code,
      device_type,
      description,
      data_parsing_config,
      command_config,
      validation_rules,
      modbus_config,
      modbus_registers,
      is_default,
      status
    } = req.body;
    if (!validateRequiredFields({ name, manufacturer_code, device_type }, res)) return;

    const duplicateConfig = await ProtocolConfig.findOne({
      where: {
        id: { [Op.ne]: protocolConfig.id },
        name,
        manufacturer_code,
        device_type
      }
    });
    if (duplicateConfig) {
      return res.status(400).json({ success: false, message: '该厂商和设备类型的协议配置已存在' });
    }

    if (is_default) {
      await ProtocolConfig.update(
        { is_default: false },
        {
          where: {
            id: { [Op.ne]: protocolConfig.id },
            manufacturer_code,
            device_type,
            is_default: true
          }
        }
      );
    }

    await protocolConfig.update({
      name,
      version,
      protocol_type,
      manufacturer_code,
      device_type,
      description,
      data_parsing_config: data_parsing_config || {},
      command_config: command_config || {},
      validation_rules: validation_rules || {},
      modbus_config: modbus_config || {},
      modbus_registers: modbus_registers || [],
      is_default,
      status,
      tenant_id: null,
      is_global: true,
      updated_at: new Date()
    });

    // 协议配置更新成功后，触发热更新
    try {
      await triggerProtocolConfigHotReload(protocolConfig.id, 'updated');
    } catch (hotReloadError) {
      console.warn('协议配置热更新失败，但协议配置已更新成功:', hotReloadError.message);
    }

    res.json({ success: true, data: protocolConfig });
  } catch (error) {
    console.error('更新协议配置失败:', error);
    res.status(500).json({ success: false, message: '更新协议配置失败', error: error.message });
  }
});

// 删除协议配置
router.delete('/:id', authenticateToken, requireProtocolManager, async (req, res) => {
  try {
    const protocolConfig = await ProtocolConfig.findByPk(req.params.id);
    if (!protocolConfig) {
      return res.status(404).json({ success: false, message: '协议配置不存在' });
    }

    if (!ensureTenantAccess(req, protocolConfig, res)) return;

    const protocolConfigId = protocolConfig.id;

    // 检查是否有电表正在使用该协议配置
    const usingMeters = await ElectricMeter.findAll({
      where: {
        protocol_config_id: protocolConfigId,
        status: 'active'
      },
      attributes: ['id', 'name', 'meter_number']
    });

    const usingDevices = await Device.findAll({
      where: {
        protocol_config_id: protocolConfigId
      },
      attributes: ['id', 'name', 'device_id']
    });

    if (usingDevices.length > 0) {
      return res.status(400).json({
        success: false,
        message: `无法删除协议配置，仍有 ${usingDevices.length} 个设备正在使用该协议配置`,
        data: {
          usingDevices: usingDevices.map(device => ({
            id: device.id,
            name: device.name,
            device_id: device.device_id
          }))
        }
      });
    }

    if (usingMeters.length > 0) {
      return res.status(400).json({
        success: false,
        message: `无法删除协议配置，仍有 ${usingMeters.length} 个活跃电表正在使用该协议配置`,
        data: {
          usingMeters: usingMeters.map(meter => ({
            id: meter.id,
            name: meter.name,
            meter_number: meter.meter_number
          }))
        }
      });
    }

    await protocolConfig.destroy();

    // 协议配置删除成功后，触发热更新（虽然没有设备使用，但记录日志）
    try {
      await triggerProtocolConfigHotReload(protocolConfigId, 'deleted');
    } catch (hotReloadError) {
      console.warn('协议配置热更新失败，但协议配置已删除成功:', hotReloadError.message);
    }

    res.json({ success: true, message: '协议配置删除成功' });
  } catch (error) {
    console.error('删除协议配置失败:', error);
    res.status(500).json({ success: false, message: '删除协议配置失败', error: error.message });
  }
});

/**
 * 触发协议配置热更新
 * @param {string} protocolConfigId - 协议配置ID
 * @param {string} action - 操作类型 ('created', 'updated', 'deleted')
 */
async function triggerProtocolConfigHotReload(protocolConfigId, action = 'updated') {
  try {
    logger.info(`开始协议配置热更新: ${protocolConfigId}, 操作: ${action}`);

    // 查找使用该协议配置的电表
    const electricMeters = await ElectricMeter.findAll({
      where: {
        protocol_config_id: protocolConfigId,
        status: 'active'
      },
      include: [{
        model: Device,
        as: 'Device',
        where: {
          status: ['active', 'online']
        },
        attributes: ['id', 'name', 'device_id', 'status']
      }]
    });

    if (electricMeters.length === 0) {
      // 提供更详细的诊断信息
      const allMetersWithConfig = await ElectricMeter.findAll({
        where: {
          protocol_config_id: protocolConfigId
        },
        include: [{
          model: Device,
          as: 'Device',
          required: false,
          attributes: ['id', 'name', 'device_id', 'status']
        }]
      });
      
      if (allMetersWithConfig.length === 0) {
        logger.info(`协议配置 ${protocolConfigId} 未被任何电表使用，无需热更新`);
      } else {
        logger.info(`协议配置 ${protocolConfigId} 被 ${allMetersWithConfig.length} 个电表使用，但都不满足热更新条件:`);
        allMetersWithConfig.forEach(meter => {
          const deviceStatus = meter.Device ? meter.Device.status : 'no_device';
          logger.info(`  - 电表 ${meter.meter_number}: 状态=${meter.status}, 设备状态=${deviceStatus}`);
        });
      }
      return;
    }

    // 获取需要重启轮询的设备列表（去重）
    const deviceIds = [...new Set(electricMeters.map(meter => meter.Device.id))];
    logger.info(`找到 ${electricMeters.length} 个电表使用该协议配置，涉及 ${deviceIds.length} 个设备`);

    // 获取轮询服务实例
    const electricMeterMqttService = global.electricMeterMqttServiceInstance;
    const devicePollingService = global.devicePollingServiceInstance;

    if (!electricMeterMqttService && !devicePollingService) {
      logger.warn('轮询服务实例未找到，无法执行热更新');
      return;
    }

    // 重启每个设备的轮询
    for (const deviceId of deviceIds) {
      try {
        logger.info(`重启设备 ${deviceId} 的轮询...`);

        // 优先使用电表MQTT服务
        if (electricMeterMqttService && typeof electricMeterMqttService.reloadDeviceConfig === 'function') {
          await electricMeterMqttService.reloadDeviceConfig(deviceId);
          logger.info(`电表MQTT服务已重启设备 ${deviceId} 的轮询`);
        } else if (devicePollingService && typeof devicePollingService.reloadDeviceConfig === 'function') {
          await devicePollingService.reloadDeviceConfig(deviceId);
          logger.info(`设备轮询服务已重启设备 ${deviceId} 的轮询`);
        } else {
          logger.warn(`设备 ${deviceId} 的轮询服务重启方法不可用`);
        }

        // 设备间重启间隔，避免同时重启造成负载
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (deviceError) {
        logger.error(`重启设备 ${deviceId} 轮询失败:`, deviceError);
      }
    }

    logger.info(`协议配置 ${protocolConfigId} 热更新完成，已重启 ${deviceIds.length} 个设备的轮询`);
  } catch (error) {
    logger.error('协议配置热更新失败:', error);
    throw error;
  }
}

module.exports = router;
module.exports.triggerProtocolConfigHotReload = triggerProtocolConfigHotReload;
