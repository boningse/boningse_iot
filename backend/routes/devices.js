const express = require('express');
const { Op } = require('sequelize');
const { Device, DeviceData, DeviceLog, Tenant, User, DeviceType, Manufacturer, sequelize } = require('../models');
const { authenticateToken, checkPermission } = require('../middleware/auth');
const { validateDevice, validateDeviceUpdate } = require('../middleware/validation');
const mqttService = require('../services/mqttService');
const mqttConfigService = require('../services/mqttConfigService');
const websocketService = require('../services/websocketService');

const router = express.Router();

/**
 * 获取设备列表
 * GET /api/devices
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const {
      page = 1,
      pageSize = 1000,
      keyword,
      status,
      type,
      tenantId,
      buildingId,
      projectGroupId,
      isThermostat,
      isLighting,
      isSwitch,
      isAirConditioner,
      excludeGateways
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
        { imei: { [Op.like]: `%${keyword}%` } }
      ];
    }

    // 状态过滤
    if (status) {
      where.status = status;
    }

    if (buildingId) {
      where.project_building_id = buildingId;
    }

    if (projectGroupId) {
      where.project_group_id = projectGroupId;
    }

    const controlFlagFilters = [
      ['is_thermostat', isThermostat ?? req.query.is_thermostat],
      ['is_lighting', isLighting ?? req.query.is_lighting],
      ['is_switch', isSwitch ?? req.query.is_switch],
      ['is_air_conditioner', isAirConditioner ?? req.query.is_air_conditioner]
    ];
    let hasControlFlagFilter = false;
    for (const [field, value] of controlFlagFilters) {
      if (value !== undefined && value !== '') {
        where[field] = String(value).toLowerCase() === 'true';
        hasControlFlagFilter = true;
      }
    }

    if (hasControlFlagFilter || String(excludeGateways).toLowerCase() === 'true') {
      where.device_category = { [Op.ne]: 'gateway' };
    }

    // 类型过滤
    if (type) {
      where.device_type_id = type;
    }

    // 设备类型名称过滤（用于前端API调用）
    let deviceTypeFilter = null;
    if (req.query.device_type) {
      const deviceType = await DeviceType.findOne({
        where: { name: req.query.device_type }
      });
      if (deviceType) {
        where.device_type_id = deviceType.id;
      }
    }

    // 查询设备列表
    const { count, rows } = await Device.findAndCountAll({
      where,
      attributes: {
        include: [
          [
            sequelize.literal('(SELECT name FROM project_buildings WHERE project_buildings.id = "Device"."project_building_id")'),
            'project_building_name'
          ],
          [
            sequelize.literal('(SELECT name FROM project_groups WHERE project_groups.id = "Device"."project_group_id")'),
            'project_group_name'
          ]
        ]
      },
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: DeviceType,
          as: 'device_type',
          attributes: ['id', 'name', 'description']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        },
        {
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'name', 'device_id'],
          required: false
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
    console.error('获取设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备列表失败',
      error: error.message
    });
  }
});

/**
 * 获取网关设备列表
 * GET /api/devices/gateways
 */
router.get('/gateways', authenticateToken, async (req, res) => {
  try {
    // 构建查询条件
    const where = {
      device_category: 'gateway'
    };

    // 根据用户角色过滤数据
    if (req.user.role !== 'admin') {
      where.tenant_id = req.user.tenant_id;
    }

    // 查询网关设备列表
    const gateways = await Device.findAll({
      where,
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: DeviceType,
          as: 'device_type',
          attributes: ['id', 'name', 'description']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        }
      ],
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      data: gateways
    });

  } catch (error) {
    console.error('获取网关设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取网关设备列表失败',
      error: error.message
    });
  }
});

/**
 * 获取设备详情
 * GET /api/devices/:id
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findByPk(id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type', 'contact_person']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        }
      ]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该设备'
      });
    }

    res.json({
      success: true,
      data: device
    });

  } catch (error) {
    console.error('获取设备详情失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备详情失败',
      error: error.message
    });
  }
});

/**
 * 检查IMEI是否存在
 * GET /api/devices/check-imei/:imei
 */
router.get('/check-imei/:imei', authenticateToken, async (req, res) => {
  try {
    const { imei } = req.params;

    if (!imei) {
      return res.status(400).json({
        success: false,
        message: 'IMEI参数不能为空'
      });
    }

    const existingDevice = await Device.findOne({
      where: { imei: imei },
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });

    res.json({
      success: true,
      exists: !!existingDevice,
      message: existingDevice ? 'IMEI已存在' : 'IMEI可用'
    });
  } catch (error) {
    console.error('检查IMEI失败:', error);
    res.status(500).json({
      success: false,
      message: '检查IMEI失败',
      error: error.message
    });
  }
});

/**
 * 创建设备
 * POST /api/devices
 */
router.post('/', authenticateToken, validateDevice, async (req, res) => {
  try {
    const deviceData = {
      ...req.body,
      created_by: req.user.id
    };

    deviceData.project_building_id = deviceData.project_building_id || null;
    deviceData.project_group_id = deviceData.project_group_id || null;

    // 处理设备分类和父设备关系
    // 如果没有提供device_category，根据设备类型名称自动判断
    if (!deviceData.device_category && deviceData.device_type_id) {
      const deviceType = await DeviceType.findByPk(deviceData.device_type_id);
      if (deviceType && deviceType.name) {
        if (deviceType.name.includes('网关')) {
          deviceData.device_category = 'gateway';
        } else {
          deviceData.device_category = 'standalone';
        }
      } else {
        deviceData.device_category = 'standalone';
      }
    } else if (!deviceData.device_category) {
      // 如果既没有提供device_category也没有device_type_id，默认为独立设备
      deviceData.device_category = 'standalone';
    }

    if (deviceData.device_category) {
      // 验证设备分类
      const validCategories = ['standalone', 'gateway', 'sub_device'];
      if (!validCategories.includes(deviceData.device_category)) {
        return res.status(400).json({
          success: false,
          message: '无效的设备分类'
        });
      }

      // 如果是子设备，必须指定父设备
      if (deviceData.device_category === 'sub_device') {
        if (!deviceData.parent_device_id) {
          return res.status(400).json({
            success: false,
            message: '子设备必须指定父设备'
          });
        }

        // 验证父设备是否存在且为网关设备
        const parentDevice = await Device.findByPk(deviceData.parent_device_id);
        if (!parentDevice) {
          return res.status(400).json({
            success: false,
            message: '指定的父设备不存在'
          });
        }

        if (parentDevice.device_category !== 'gateway') {
          return res.status(400).json({
            success: false,
            message: '父设备必须是网关设备'
          });
        }

        // 权限检查：确保父设备属于同一租户
        if (req.user.role !== 'admin') {
          if (parentDevice.tenant_id !== req.user.tenant_id) {
            return res.status(403).json({
              success: false,
              message: '无权访问指定的父设备'
            });
          }
          // 子设备必须与父设备在同一租户
          deviceData.tenant_id = parentDevice.tenant_id;
        }

        // 验证子设备序号唯一性
        if (deviceData.sub_device_sequence) {
          const existingSubDevice = await Device.findOne({
            where: {
              parent_device_id: deviceData.parent_device_id,
              sub_device_sequence: deviceData.sub_device_sequence
            }
          });

          if (existingSubDevice) {
            return res.status(400).json({
              success: false,
              message: `子设备序号 ${deviceData.sub_device_sequence} 在该网关下已存在，请使用其他序号`
            });
          }
        }
      } else {
        // 非子设备不能有父设备
        deviceData.parent_device_id = null;
      }
    }

    // 处理mqtt_config字段格式转换
    if (deviceData.mqtt_config) {
      const mqttConfig = deviceData.mqtt_config;

      // 转换前端简化格式为系统标准格式
      if (mqttConfig.subscribe_topic || mqttConfig.subscribeTopic) {
        mqttConfig.subscribe_topics = [mqttConfig.subscribe_topic || mqttConfig.subscribeTopic].filter(Boolean);
      }

      if (mqttConfig.publish_topic || mqttConfig.publishTopic) {
        mqttConfig.publish_topics = [mqttConfig.publish_topic || mqttConfig.publishTopic].filter(Boolean);
      }

      // 保持兼容性，同时保留原字段
      if (mqttConfig.subscription_type || mqttConfig.subscriptionType) {
        mqttConfig.subscription_type = mqttConfig.subscription_type || mqttConfig.subscriptionType;
      }

      deviceData.mqtt_config = mqttConfig;
    }

    // 如果不是管理员，只能在自己的租户下创建设备
    if (req.user.role !== 'admin') {
      deviceData.tenant_id = req.user.tenant_id;
    } else {
      // 如果是admin用户但没有指定tenant_id，需要明确指定一个租户
      if (!deviceData.tenant_id) {
        return res.status(400).json({
          success: false,
          message: '管理员添加设备时必须指定租户ID',
          code: 'TENANT_ID_REQUIRED'
        });
      }
    }

    // 处理子设备的IMEI和device_id逻辑
    if (deviceData.device_category === 'sub_device') {
      // 子设备可以没有IMEI，但需要生成唯一的device_id
      if (!deviceData.imei) {
        // 获取父设备信息
        const parentDevice = await Device.findByPk(deviceData.parent_device_id);
        if (!parentDevice) {
          return res.status(400).json({
            success: false,
            message: '指定的父设备不存在'
          });
        }

        // 查找同一父设备下的子设备数量，生成序号
        const siblingCount = await Device.count({
          where: {
            parent_device_id: deviceData.parent_device_id,
            device_category: 'sub_device'
          }
        });

        // 生成虚拟IMEI和device_id
        const subDeviceSequence = String(siblingCount + 1).padStart(2, '0');
        const virtualImei = `${parentDevice.imei || parentDevice.device_id}-${subDeviceSequence}`;
        
        // 检查生成的虚拟IMEI是否已存在
        const existingVirtualDevice = await Device.findOne({
          where: { imei: virtualImei }
        });

        if (existingVirtualDevice) {
          // 如果存在，尝试下一个序号
          let nextSequence = siblingCount + 2;
          let nextVirtualImei;
          do {
            const seqStr = String(nextSequence).padStart(2, '0');
            nextVirtualImei = `${parentDevice.imei || parentDevice.device_id}-${seqStr}`;
            const existingNext = await Device.findOne({
              where: { imei: nextVirtualImei }
            });
            if (!existingNext) break;
            nextSequence++;
          } while (nextSequence < 100); // 最多尝试100个序号

          if (nextSequence >= 100) {
            return res.status(400).json({
              success: false,
              message: '无法为子设备生成唯一的虚拟IMEI'
            });
          }
          virtualImei = nextVirtualImei;
        }

        deviceData.imei = virtualImei;
        deviceData.device_id = virtualImei;
      } else {
        // 子设备提供了IMEI，需要检查唯一性
        const existingDeviceByImei = await Device.findOne({
          where: { imei: deviceData.imei }
        });

        if (existingDeviceByImei) {
          // 获取父设备信息
          const parentDevice = await Device.findByPk(deviceData.parent_device_id);
          
          if (!parentDevice) {
            return res.status(400).json({
              success: false,
              message: '指定的父设备不存在'
            });
          }
          
          // 如果IMEI已存在，检查是否属于父级网关设备
          if (existingDeviceByImei.id === parentDevice.id && 
              existingDeviceByImei.device_category === 'gateway') {
            // 允许子设备使用与父级网关相同的IMEI
            console.log(`子设备允许使用父级网关的IMEI: ${deviceData.imei}`);
          } else {
            // IMEI属于其他设备，不允许使用
            return res.status(400).json({
              success: false,
              message: `IMEI已存在，属于其他设备。子设备只能使用其父网关的IMEI (${parentDevice.imei || parentDevice.device_id})`
            });
          }
        }

        // 设置device_id - 对于子设备，使用特殊格式避免与父设备冲突
        if (!deviceData.device_id) {
          // 为子设备生成唯一的device_id，格式：父设备IMEI-子设备序号
          const parentDevice = await Device.findByPk(deviceData.parent_device_id);
          if (parentDevice && deviceData.sub_device_sequence) {
            deviceData.device_id = `${parentDevice.imei || parentDevice.device_id}-${String(deviceData.sub_device_sequence).padStart(2, '0')}`;
          } else {
            deviceData.device_id = deviceData.imei;
          }
        }
      }
    } else {
      // 非子设备的原有逻辑
      // 设置device_id，如果没有提供则使用IMEI
      if (!deviceData.device_id && deviceData.imei) {
        deviceData.device_id = deviceData.imei;
      }

      // 检查IMEI是否已存在
      if (deviceData.imei) {
        const existingDeviceByImei = await Device.findOne({
          where: { imei: deviceData.imei }
        });

        if (existingDeviceByImei) {
          return res.status(400).json({
            success: false,
            message: 'IMEI已存在'
          });
        }
      }
    }

    // 检查device_id是否已存在
    if (deviceData.device_id) {
      const existingDeviceById = await Device.findOne({
        where: { device_id: deviceData.device_id }
      });

      if (existingDeviceById) {
        return res.status(400).json({
          success: false,
          message: '设备ID已存在'
        });
      }
    }

    // 设备数量限制已移除 - 租户可以添加任意数量的设备

    const device = await Device.create(deviceData);

    // 空调温控器无论是独立设备还是网关子设备，都需要初始化温控属性，
    // 否则温控控制页面不会将其识别为可控温控器。
    try {
      const createdDeviceType = await DeviceType.findByPk(deviceData.device_type_id);
      if (createdDeviceType?.name === '空调温控器') {
        await sequelize.query(`
          INSERT INTO thermostat_properties (
            device_id, current_temperature, target_temp, ac_mode, power_status, created_at, updated_at
          )
          VALUES (:deviceId, 25.0, 24.0, 'cool', false, NOW(), NOW())
          ON CONFLICT (device_id) DO NOTHING
        `, {
          replacements: { deviceId: device.id }
        });
      }
    } catch (thermostatInitError) {
      console.error('初始化温控器属性失败:', thermostatInitError);
    }

    // 获取完整的设备信息
    const fullDevice = await Device.findByPk(device.id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        },
        {
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'name', 'device_id', 'device_category']
        }
      ]
    });

    // 初始化设备的MQTT配置
    try {
      // 如果前端没有提供mqtt_config或配置不完整，则使用系统默认配置
      if (!fullDevice.mqtt_config ||
        (!fullDevice.mqtt_config.subscribe_topics && !fullDevice.mqtt_config.subscribe_topic && !fullDevice.mqtt_config.subscribeTopic)) {
        const mqttConfig = mqttConfigService.buildDeviceConfig(fullDevice);

        // 如果前端提供了部分配置，则合并配置
        if (fullDevice.mqtt_config) {
          const mergedConfig = { ...mqttConfig, ...fullDevice.mqtt_config };
          await fullDevice.update({ mqtt_config: mergedConfig });
        } else {
          await fullDevice.update({ mqtt_config: mqttConfig });
        }

        console.log(`设备 ${fullDevice.device_id} MQTT配置已初始化:`, {
          manufacturer: fullDevice.manufacturer?.code,
          subscription_type: fullDevice.manufacturer?.subscription_type,
          subscribe_topics: (fullDevice.mqtt_config?.subscribe_topics || mqttConfig.subscribe_topics)?.map(t => t.topic || t)
        });
      }
    } catch (error) {
      console.error('初始化设备MQTT配置失败:', error);
      // 不阻断设备创建流程，只记录错误
    }

    // 为新设备订阅MQTT命令主题
    try {
      if (mqttService) {
        await mqttService.subscribeNewDevice(fullDevice);
      }
    } catch (subscribeError) {
      console.error('为新设备订阅MQTT主题失败:', {
        deviceId: fullDevice.device_id,
        error: subscribeError.message
      });
      // 不影响设备创建流程，只记录错误
    }

    // 记录创建日志
    const logMessage = deviceData.device_category === 'sub_device' 
      ? `子设备创建成功，父设备: ${fullDevice.parent_device?.name || deviceData.parent_device_id}`
      : '设备创建成功';
    
    await DeviceLog.create({
      device_id: device.id,
      log_type: 'info',
      message: logMessage,
      details: mqttService.sanitizeDataForStorage({ 
        creator: req.user.username,
        device_category: deviceData.device_category,
        parent_device_id: deviceData.parent_device_id
      }),
      timestamp: new Date()
    });

    // 设置30分钟后自动将设备状态改为offline
    setTimeout(async () => {
      try {
        const deviceToUpdate = await Device.findByPk(device.id);
        if (deviceToUpdate && deviceToUpdate.status === 'online') {
          await deviceToUpdate.update({ status: 'offline' });
          
          // 记录状态变更日志
          await DeviceLog.create({
            device_id: device.id,
            log_type: 'info',
            message: '设备状态自动变更为离线（30分钟超时）',
            details: { previous_status: 'online', new_status: 'offline', reason: 'auto_timeout' },
            timestamp: new Date()
          });
          
          // 通过WebSocket通知状态变更
          websocketService.broadcastToTenant(device.tenant_id, 'device_status_changed', {
            device_id: device.id,
            status: 'offline',
            reason: 'auto_timeout'
          });
          
          console.log(`设备 ${device.device_id} 已自动设置为离线状态（30分钟超时）`);
        }
      } catch (error) {
        console.error('自动设置设备离线状态失败:', error);
      }
    }, 30 * 60 * 1000); // 30分钟

    res.status(201).json({
      success: true,
      message: '设备创建成功',
      data: fullDevice
    });

  } catch (error) {
    console.error('创建设备失败:', error);
    
    // 处理数据库约束错误
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors[0]?.path;
      let message = '设备创建失败';
      
      if (field === 'imei') {
        message = 'IMEI已存在';
      } else if (field === 'device_id') {
        message = '设备ID已存在';
      }
      
      return res.status(400).json({
        success: false,
        message
      });
    }

    res.status(500).json({
      success: false,
      message: '设备创建失败',
      error: error.message
    });
  }
});

/**
 * 更新设备
 * PUT /api/devices/:id
 */
router.put('/:id', authenticateToken, validateDeviceUpdate, async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    if (Object.prototype.hasOwnProperty.call(updateData, 'project_building_id')) {
      updateData.project_building_id = updateData.project_building_id || null;
    }
    if (Object.prototype.hasOwnProperty.call(updateData, 'project_group_id')) {
      updateData.project_group_id = updateData.project_group_id || null;
    }

    const device = await Device.findByPk(id);
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权修改该设备'
      });
    }

    // 如果更新IMEI，检查是否重复
    if (updateData.imei && updateData.imei !== device.imei) {
      const existingDevice = await Device.findOne({
        where: {
          imei: updateData.imei,
          id: { [Op.ne]: id }
        }
      });

      if (existingDevice) {
        return res.status(400).json({
          success: false,
          message: 'IMEI已存在'
        });
      }
    }

    // 如果更新device_id，检查是否重复
    if (updateData.device_id && updateData.device_id !== device.device_id) {
      const existingDeviceById = await Device.findOne({
        where: {
          device_id: updateData.device_id,
          id: { [Op.ne]: id }
        }
      });

      if (existingDeviceById) {
        return res.status(400).json({
          success: false,
          message: '设备ID已存在'
        });
      }
    }

    // 如果更新了device_type_id，需要重新判断device_category
    if (updateData.device_type_id && updateData.device_type_id !== device.device_type_id) {
      const deviceType = await DeviceType.findByPk(updateData.device_type_id);
      if (deviceType && deviceType.name) {
        if (deviceType.name.includes('网关')) {
          updateData.device_category = 'gateway';
        } else if (!updateData.device_category) {
          // 只有在没有明确指定device_category时才自动设置为standalone
          updateData.device_category = 'standalone';
        }
      }
    }

    // 处理mqtt_config字段格式转换
    if (updateData.mqtt_config) {
      const mqttConfig = updateData.mqtt_config;

      // 转换前端简化格式为系统标准格式
      if (mqttConfig.subscribe_topic || mqttConfig.subscribeTopic) {
        mqttConfig.subscribe_topics = [mqttConfig.subscribe_topic || mqttConfig.subscribeTopic].filter(Boolean);
      }

      if (mqttConfig.publish_topic || mqttConfig.publishTopic) {
        mqttConfig.publish_topics = [mqttConfig.publish_topic || mqttConfig.publishTopic].filter(Boolean);
      }

      // 保持兼容性，同时保留原字段
      if (mqttConfig.subscription_type || mqttConfig.subscriptionType) {
        mqttConfig.subscription_type = mqttConfig.subscription_type || mqttConfig.subscriptionType;
      }

      updateData.mqtt_config = mqttConfig;
    }

    await device.update(updateData);

    // 如果更新了mqtt_config，清除缓存以确保获取最新配置
    if (updateData.mqtt_config) {
      const mqttConfigService = require('../services/mqttConfigService');
      mqttConfigService.clearDeviceCache(device.device_id);
    }

    // 获取更新后的完整设备信息
    const updatedDevice = await Device.findByPk(id, {
      include: [
        {
          model: Tenant,
          as: 'tenant',
          attributes: ['id', 'name', 'type']
        },
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'username', 'profile']
        },
        {
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['id', 'name', 'code', 'subscription_type']
        }
      ]
    });

    // 记录更新日志
    await DeviceLog.create({
      device_id: device.id,
      log_type: 'info',
      message: '设备信息更新',
      details: mqttService.sanitizeDataForStorage({
        updater: req.user.username,
        changes: updateData
      }),
      timestamp: new Date()
    });

    // 通过WebSocket通知
    websocketService.broadcastToTenant(device.tenant_id, 'device_updated', updatedDevice);

    res.json({
      success: true,
      message: '设备更新成功',
      data: updatedDevice
    });

  } catch (error) {
    console.error('更新设备失败:', error);
    res.status(500).json({
      success: false,
      message: '更新设备失败',
      error: error.message
    });
  }
});

/**
 * 删除设备
 * DELETE /api/devices/:id
 */
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const device = await Device.findByPk(id, {
      include: [{
        model: Manufacturer,
        as: 'manufacturer',
        attributes: ['code', 'subscription_type']
      }]
    });

    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权删除该设备'
      });
    }

    // 取消设备的MQTT订阅
    try {
      if (mqttService) {
        await mqttService.unsubscribeDevice(device);
      }
    } catch (unsubscribeError) {
      console.error('取消设备MQTT订阅失败:', {
        deviceId: device.device_id,
        error: unsubscribeError.message
      });
      // 不影响设备删除流程，只记录错误
    }

    // 记录删除日志
    await DeviceLog.create({
      device_id: device.id,
      log_type: 'warning',
      message: '设备被删除',
      details: {
        deleter: req.user.username,
        device_info: {
          name: device.name,
          imei: device.imei
        }
      },
      timestamp: new Date()
    });

    await device.destroy();

    // 通过WebSocket通知
    websocketService.broadcastToTenant(device.tenant_id, 'device_deleted', {
      id: device.id,
      name: device.name,
      imei: device.imei
    });

    res.json({
      success: true,
      message: '设备删除成功'
    });

  } catch (error) {
    console.error('删除设备失败:', error);
    res.status(500).json({
      success: false,
      message: '删除设备失败',
      error: error.message
    });
  }
});

/**
 * 获取设备数据
 * GET /api/devices/:id/data
 */
router.get('/:id/data', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      pageSize = 50,
      dataType,
      startTime,
      endTime
    } = req.query;

    const device = await Device.findByPk(id, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该设备数据'
      });
    }

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const where = { device_id: id };

    if (dataType) {
      where.data_type = dataType;
    }

    if (startTime && endTime) {
      where.timestamp = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      };
    } else if (startTime) {
      where.timestamp = {
        [Op.gte]: new Date(startTime)
      };
    } else if (endTime) {
      where.timestamp = {
        [Op.lte]: new Date(endTime)
      };
    }

    const { count, rows } = await DeviceData.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
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
    console.error('获取设备数据失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备数据失败',
      error: error.message
    });
  }
});

/**
 * 获取设备日志
 * GET /api/devices/:id/logs
 */
router.get('/:id/logs', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      page = 1,
      pageSize = 20,
      logType,
      startTime,
      endTime
    } = req.query;

    const device = await Device.findByPk(id, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权访问该设备日志'
      });
    }

    const offset = (page - 1) * pageSize;
    const limit = parseInt(pageSize);

    // 构建查询条件
    const where = { device_id: id };

    if (logType) {
      where.level = logType;
    }

    if (startTime && endTime) {
      where.timestamp = {
        [Op.between]: [new Date(startTime), new Date(endTime)]
      };
    }

    const { count, rows } = await DeviceLog.findAndCountAll({
      where,
      order: [['timestamp', 'DESC']],
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
    console.error('获取设备日志失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备日志失败',
      error: error.message
    });
  }
});

/**
 * 发送命令到设备
 * POST /api/devices/:id/command
 */
router.post('/:id/command', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { command, params, timestamp, mqttTopic } = req.body;

    const device = await Device.findByPk(id, {
      attributes: {
        exclude: ['device_category']  // 排除有问题的字段
      }
    });
    if (!device) {
      return res.status(404).json({
        success: false,
        message: '设备不存在'
      });
    }

    // 权限检查
    if (req.user.role !== 'admin' && device.tenant_id !== req.user.tenant_id) {
      return res.status(403).json({
        success: false,
        message: '无权控制该设备'
      });
    }

    // 检查设备是否在线（允许离线设备发送命令，但给出警告）
    let statusWarning = null;
    if (device.status !== 'online') {
      statusWarning = '设备当前离线，命令可能无法送达';
    }

    // 直接发送原始命令，不进行任何封装
    let commandData;
    if (typeof command === 'string') {
      // 尝试解析为JSON，如果成功则发送解析后的对象，否则发送原始字符串
      try {
        commandData = JSON.parse(command);
      } catch (parseError) {
        commandData = command;
      }
    } else {
      // 直接使用原始命令对象
      commandData = command;
    }

    // 发送MQTT命令，调试场景允许前端指定本次发送主题
    if (mqttTopic && typeof commandData === 'object' && commandData !== null) {
      commandData.mqttTopic = mqttTopic;
    }
    await mqttService.sendCommandToDevice(device.imei, commandData, { mqttTopic });

    // 记录命令日志
    await DeviceLog.create({
      device_id: device.id,
      level: 'info',
      message: `发送数据到设备: ${typeof commandData === 'string' ? commandData.substring(0, 50) : JSON.stringify(commandData).substring(0, 50)}${(typeof commandData === 'string' ? commandData.length : JSON.stringify(commandData).length) > 50 ? '...' : ''}`,
      data: {
        direction: 'outgoing',
        source: 'api',
        payload: commandData,
        dataSize: typeof commandData === 'string' ? commandData.length : JSON.stringify(commandData).length,
        timestamp: new Date().toISOString(),
        messageType: 'command',
        sender: req.user.username,
        deviceStatus: device.status,
        deviceImei: device.imei
      }
    });

    const response = {
      success: true,
      message: '数据发送成功',
      data: {
        commandId: `cmd_${Date.now()}`,
        timestamp: new Date().toISOString()
      }
    };

    if (statusWarning) {
      response.warning = statusWarning;
    }

    res.json(response);

  } catch (error) {
    console.error('发送设备命令失败:', error);
    res.status(500).json({
      success: false,
      message: '发送设备命令失败',
      error: error.message
    });
  }
});

/**
 * 获取设备统计信息
 * GET /api/devices/stats
 */
router.get('/stats/overview', authenticateToken, async (req, res) => {
  try {
    const where = {};

    // 根据用户角色过滤数据
    if (req.user.role !== 'admin') {
      where.tenant_id = req.user.tenant_id;
    }

    // 总设备数
    const totalDevices = await Device.count({ where });

    // 在线设备数
    const onlineDevices = await Device.count({
      where: { ...where, status: 'online' }
    });

    // 离线设备数
    const offlineDevices = await Device.count({
      where: { ...where, status: 'offline' }
    });

    // 故障设备数
    const errorDevices = await Device.count({
      where: { ...where, status: 'error' }
    });

    // 按类型统计
    const devicesByType = await Device.findAll({
      where,
      attributes: [
        'device_type_id',
        [Device.sequelize.fn('COUNT', Device.sequelize.col('Device.id')), 'count']
      ],
      group: ['Device.device_type_id', 'device_type.id', 'device_type.name'],
      include: [{
        model: DeviceType,
        as: 'device_type',
        attributes: ['name']
      }]
    });

    res.json({
      success: true,
      data: {
        total: totalDevices,
        online: onlineDevices,
        offline: offlineDevices,
        error: errorDevices,
        byType: devicesByType.reduce((acc, item) => {
          const typeName = item.device_type?.name || `类型${item.device_type_id}`;
          acc[typeName] = parseInt(item.dataValues.count);
          return acc;
        }, {})
      }
    });

  } catch (error) {
    console.error('获取设备统计失败:', error);
    res.status(500).json({
      success: false,
      message: '获取设备统计失败',
      error: error.message
    });
  }
});

module.exports = router;
