const db = require('../utils/database');
const { pool } = require('../utils/database');
const logger = require('../utils/logger');
const mqttService = require('./mqttService');
const websocketService = require('./websocketService');
const mqttConfigService = require('./mqttConfigService');

/**
 * 温控器服务层
 * 处理温控器相关的业务逻辑
 */
class ThermostatService {
  constructor() {
    // 内存缓存存储设备实时状态
    this.deviceStatusCache = new Map();
  }

  /**
   * 更新设备状态缓存
   */
  updateDeviceStatusCache(deviceId, statusData) {
    const currentCache = this.deviceStatusCache.get(deviceId) || {};
    const updatedCache = { ...currentCache, ...statusData };
    this.deviceStatusCache.set(deviceId, updatedCache);
  }

  /**
   * 获取设备状态缓存
   */
  getDeviceStatusCache(deviceId) {
    return this.deviceStatusCache.get(deviceId) || {};
  }

  // ============================================
  // 温控器设备管理
  // ============================================

  /**
   * 获取温控器设备列表
   */
  async getThermostatDevices(page, pageSize, filters) {
    // 添加详细日志
    console.log('🔍 [温控器查询] 开始查询温控器设备列表:', {
      page,
      pageSize,
      filters,
      offset: (page - 1) * pageSize
    });
    logger.info('🔍 [温控器查询] 开始查询温控器设备列表:', {
      page,
      pageSize,
      filters,
      offset: (page - 1) * pageSize
    });

    const offset = (page - 1) * pageSize;
    const { keyword, status, groupId, buildingId, projectGroupId, tenantId } = filters;

    // 处理租户过滤条件 - admin用户可以查看所有租户的设备
    let whereClause = `WHERE dt.name = '空调温控器'
      AND d.is_thermostat = true
      AND COALESCE(d.device_category, 'standalone') <> 'gateway'`;
    let params = [];
    let paramIndex = 1;

    // 如果tenantId不为null，添加租户过滤条件
    if (tenantId !== null && tenantId !== undefined) {
      whereClause += ` AND d.tenant_id = $${paramIndex}`;
      params.push(tenantId);
      paramIndex++;
    }

    // 关键字搜索
    if (keyword) {
      whereClause += ` AND (d.name ILIKE $${paramIndex} OR d.device_id ILIKE $${paramIndex})`;
      params.push(`%${keyword}%`);
      paramIndex++;
    }

    // 状态过滤
    if (status === 'running') {
      whereClause += ' AND COALESCE(tp.power_status, false) = true';
    } else if (status === 'standby') {
      whereClause += ' AND d.status != \'offline\' AND COALESCE(tp.power_status, false) = false';
    } else if (status === 'offline') {
      whereClause += ' AND d.status = \'offline\'';
    }

    // 分组过滤
    if (groupId) {
      whereClause += ` AND tp.group_id = $${paramIndex}`;
      params.push(groupId);
      paramIndex++;
    }

    if (buildingId) {
      whereClause += ` AND d.project_building_id = $${paramIndex}`;
      params.push(buildingId);
      paramIndex++;
    }

    if (projectGroupId) {
      whereClause += ` AND d.project_group_id = $${paramIndex}`;
      params.push(projectGroupId);
      paramIndex++;
    }

    const query = `
      SELECT 
        d.id,
        d.name,
        d.device_id,
        d.imei,
        d.status,
        d.location,
        d.project_building_id,
        d.project_group_id,
        d.tenant_id,
        d.created_at,
        d.updated_at,
        tp.current_temperature,
        tp.target_temp as target_temperature,
        tp.ac_mode as mode,
        tp.fan_speed,
        tp.humidity,
        tp.power_status as is_on,
        tp.last_data_time,
        tp.group_id,
        tg.name as group_name,
        t.name as tenant_name,
        pb.name as project_building_name,
        pg.name as project_group_name,
        dt.name as device_type_name,
        COALESCE(tp.last_data_time, d.updated_at) as last_update
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      LEFT JOIN project_buildings pb ON d.project_building_id = pb.id
      LEFT JOIN project_groups pg ON d.project_group_id = pg.id
      LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
      LEFT JOIN thermostat_groups tg ON tp.group_id = tg.id
      ${whereClause}
      ORDER BY d.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
      ${whereClause}
    `;

    params.push(pageSize, offset);

    // 添加SQL查询日志
    logger.info('🔍 [SQL查询] 执行温控器设备查询:', {
      query: query.replace(/\s+/g, ' ').trim(),
      params,
      limitParam: pageSize,
      offsetParam: offset,
      tenantId: tenantId,
      whereClause: whereClause
    });

    try {
      const [devices, countResult] = await Promise.all([
        db.query(query, params),
        db.query(countQuery, params.slice(0, -2))
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / pageSize);

      // 添加查询结果日志
      console.log('✅ [查询结果] 温控器设备查询完成:', {
        返回设备数量: devices.rows.length,
        总设备数量: total,
        当前页: page,
        每页大小: pageSize,
        总页数: totalPages,
        设备列表: devices.rows.map(d => ({ id: d.id, name: d.name, device_id: d.device_id }))
      });
      logger.info('✅ [查询结果] 温控器设备查询完成:', {
        返回设备数量: devices.rows.length,
        总设备数量: total,
        当前页: page,
        每页大小: pageSize,
        总页数: totalPages,
        设备列表: devices.rows.map(d => ({ id: d.id, name: d.name, device_id: d.device_id }))
      });

      // 为设备数据添加fanSpeed和acMode默认值，以及关联信息
      const devicesWithDefaults = devices.rows.map(device => ({
        ...device,
        fanSpeed: device.fan_speed !== undefined && device.fan_speed !== null ? device.fan_speed : 0,  // 使用数据库中的fan_speed字段，默认为0（自动档）
        acMode: device.mode || 'cool',   // 默认为制冷模式
        tenant: device.tenant_name ? { name: device.tenant_name } : null,
        device_type: device.device_type_name ? { name: device.device_type_name } : null,
        lastUpdate: device.last_update
      }));

      return {
        list: devicesWithDefaults,
        pagination: {
          total,
          page,
          pageSize,
          totalPages
        }
      };
    } catch (error) {
      logger.error('获取温控器设备列表失败:', error);
      throw error;
    }
  }

  /**
   * 获取单个温控器设备详情
   */
  async getThermostatDevice(deviceId, tenantId) {
    const params = [deviceId];
    let tenantClause = '';
    if (tenantId !== null && tenantId !== undefined) {
      params.push(tenantId);
      tenantClause = ` AND d.tenant_id = $${params.length}`;
    }

    const query = `
      SELECT 
        d.id,
        d.name,
        d.device_id,
        d.imei,
        d.device_category,
        d.parent_device_id,
        d.sub_device_sequence,
        d.manufacturer_code,
        d.status,
        d.location,
        d.created_at,
        d.updated_at,
        d.protocol_config_id,
        tp.current_temperature,
        tp.target_temp as target_temperature,
        tp.ac_mode as mode,
        tp.fan_speed,
        tp.power_status as is_on,
        tp.humidity,
        tp.group_id,
        tg.name as group_name,
        tg.description as group_description,
        m.code as manufacturer_code_full,
        m.subscription_type,
        pc.command_config,
        p.device_id as parent_device_code,
        p.imei as parent_imei,
        p.manufacturer_code as parent_manufacturer_code,
        pm.subscription_type as parent_subscription_type,
        ppc.command_config as parent_command_config,
        t.name as tenant_name,
        dt.name as device_type_name,
        COALESCE(tp.last_data_time, d.updated_at) as last_update
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
      LEFT JOIN thermostat_groups tg ON tp.group_id = tg.id
      LEFT JOIN manufacturers m ON d.manufacturer_code = m.code
      LEFT JOIN protocol_configs pc ON d.protocol_config_id = pc.id
      LEFT JOIN devices p ON d.parent_device_id = p.id
      LEFT JOIN manufacturers pm ON p.manufacturer_code = pm.code
      LEFT JOIN protocol_configs ppc ON p.protocol_config_id = ppc.id
      WHERE (d.id::text = $1 OR d.device_id = $1)
        AND dt.name = '空调温控器'
        AND d.is_thermostat = true
        AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}
    `;

    try {
      const result = await db.query(query, params);
      const device = result.rows[0];
      
      if (device) {
        // 为设备数据添加fanSpeed和acMode默认值，以及关联信息
        device.fanSpeed = device.fan_speed !== undefined && device.fan_speed !== null ? device.fan_speed : 0;  // 使用数据库中的fan_speed字段，默认为0（自动档）
        device.acMode = device.mode || 'cool';   // 默认为制冷模式
        device.tenant = device.tenant_name ? { name: device.tenant_name } : null;
        device.device_type = device.device_type_name ? { name: device.device_type_name } : null;
        device.lastUpdate = device.last_update;
        if (device.device_category === 'sub_device' && device.parent_device_id) {
          device.communication_device_id = device.parent_device_code || device.device_id;
          device.communication_imei = device.parent_imei || device.imei;
          device.communication_manufacturer_code = device.parent_manufacturer_code || device.manufacturer_code;
          device.communication_subscription_type = device.parent_subscription_type || device.subscription_type;
          device.command_config = device.parent_command_config || device.command_config;
          device.thermostat_unit_id = device.sub_device_sequence || 1;
        } else {
          device.communication_device_id = device.device_id;
          device.communication_imei = device.imei;
          device.communication_manufacturer_code = device.manufacturer_code;
          device.communication_subscription_type = device.subscription_type;
          device.thermostat_unit_id = device.sub_device_sequence || 1;
        }
      }
      
      return device || null;
    } catch (error) {
      logger.error('获取温控器设备详情失败:', error);
      throw error;
    }
  }

  /**
   * 添加温控器设备
   */
  async addThermostatDevice(deviceData, tenantId, userId) {
    const target = await db.transaction(async (client) => {
      if (!deviceData.device_id) {
        throw new Error('设备ID不能为空');
      }

      const lookupParams = [String(deviceData.device_id)];
      let tenantClause = '';
      if (tenantId !== null && tenantId !== undefined) {
        lookupParams.push(tenantId);
        tenantClause = ` AND d.tenant_id = $${lookupParams.length}`;
      }

      const findResult = await client.query(`
        SELECT d.id, d.tenant_id, d.device_category, dt.name AS device_type_name
        FROM devices d
        JOIN device_types dt ON dt.id = d.device_type_id
        WHERE (d.id::text = $1 OR d.device_id = $1)${tenantClause}
        FOR UPDATE
      `, lookupParams);
      if (findResult.rows.length === 0) {
        throw new Error('设备不存在或无权访问');
      }

      const existingDevice = findResult.rows[0];
      if (existingDevice.device_category === 'gateway') {
        throw new Error('网关设备不能加入温控管理');
      }
      if (existingDevice.device_type_name !== '空调温控器') {
        throw new Error('只能添加设备类型为空调温控器的设备');
      }

      const moduleAssignmentResult = await client.query(
        `SELECT module_type
         FROM control_device_assignments
         WHERE device_id = $1 AND is_active = true AND module_type <> 'thermostat'
         LIMIT 1`,
        [existingDevice.id]
      );
      if (moduleAssignmentResult.rows.length > 0) {
        throw new Error(`设备已加入${moduleAssignmentResult.rows[0].module_type}控制模块，不能重复加入温控管理`);
      }

      await client.query(
        'UPDATE devices SET is_thermostat = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [existingDevice.id]
      );

      await client.query(
        `INSERT INTO control_device_assignments (
           tenant_id, device_id, module_type, subtype, is_active, created_by
         ) VALUES ($1, $2, 'thermostat', 'air_conditioner_thermostat', true, $3)
         ON CONFLICT (device_id, module_type) DO UPDATE
         SET tenant_id = EXCLUDED.tenant_id, is_active = true, updated_at = CURRENT_TIMESTAMP`,
        [existingDevice.tenant_id, existingDevice.id, userId]
      );

      await client.query(`
        INSERT INTO thermostat_properties (
          device_id, current_temperature, target_temp, ac_mode, 
          power_status, group_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (device_id) DO NOTHING
      `, [
        existingDevice.id,
        deviceData.current_temperature || 25.0,
        deviceData.target_temp || deviceData.target_temperature || 24.0,
        deviceData.ac_mode || deviceData.mode || 'cool',
        deviceData.power_status ?? deviceData.is_on ?? false,
        deviceData.group_id || null
      ]);

      return { id: existingDevice.id, tenantId: existingDevice.tenant_id };
    });

    const device = await this.getThermostatDevice(target.id, tenantId);
    if (websocketService && websocketService.broadcastToTenant) {
      websocketService.broadcastToTenant(target.tenantId, 'thermostat_device_added', {
        ...device,
        deviceId: device.id,
        device_id: device.id
      });
    }
    return device;
  }

  /**
   * 删除温控器设备
   */
  async deleteThermostatDevice(deviceId, tenantId, userId) {
    return await db.transaction(async (client) => {
      const params = [deviceId];
      let tenantClause = '';
      if (tenantId !== null && tenantId !== undefined) {
        params.push(tenantId);
        tenantClause = ` AND d.tenant_id = $${params.length}`;
      }

      const checkQuery = `
        SELECT d.id, d.tenant_id FROM devices d
        LEFT JOIN device_types dt ON d.device_type_id = dt.id
        WHERE d.id = $1
          AND dt.name = '空调温控器'
          AND d.is_thermostat = true
          AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}
      `;
      const checkResult = await client.query(checkQuery, params);
      
      if (checkResult.rows.length === 0) {
        return false;
      }

      // 删除相关数据（级联删除）
      await client.query(
        'UPDATE devices SET is_thermostat = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
        [deviceId]
      );
      await client.query('DELETE FROM thermostat_schedules WHERE device_id = $1', [deviceId]);
      await client.query('DELETE FROM thermostat_runtime_stats WHERE device_id = $1', [deviceId]);
      await client.query(
        `UPDATE control_device_assignments
         SET is_active = false, updated_at = CURRENT_TIMESTAMP
         WHERE device_id = $1 AND module_type = 'thermostat'`,
        [deviceId]
      );

      // 通过WebSocket通知设备删除
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(checkResult.rows[0].tenant_id, 'thermostat_device_deleted', { deviceId });
      }
      
      return true;
    });
  }

  // ============================================
  // 温控器设备控制
  // ============================================

  /**
   * 转换模式到协议格式
   * @param {string} mode - 前端模式 (cool, heat, dehumidify, fan)
   * @returns {number} 协议模式 (0送风，1制热，2制冷，3除湿)
   */
  convertModeToProtocol(mode) {
    const modeMap = {
      'fan': 0,      // 送风
      'heat': 1,     // 制热
      'cool': 2,     // 制冷
      'dehumidify': 3 // 除湿
    };
    
    // 添加调试日志
    const protocolValue = modeMap[mode];
    console.log(`🔄 [模式转换] 前端模式: ${mode} -> 协议值: ${protocolValue}`);
    
    return protocolValue;
  }

  /**
   * 转换协议模式到前端格式
   * @param {number} protocolMode - 协议模式
   * @returns {string} 前端模式
   */
  convertProtocolToMode(protocolMode) {
    const modeMap = {
      0: 'fan',       // 送风
      1: 'heat',      // 制热
      2: 'cool',      // 制冷
      3: 'dehumidify' // 除湿
    };
    return modeMap[protocolMode] || 'cool'; // 默认制冷
  }

  /**
   * 转换前端模式到数据库格式
   * @param {string} frontendMode - 前端模式
   * @returns {string} 数据库模式
   */
  convertModeToDatabase(frontendMode) {
    const modeMap = {
      'fan': 'fan',
      'heat': 'heat', 
      'cool': 'cool',
      'dehumidify': 'dehumidify' // 前端除湿模式对应数据库的dehumidify
    };
    return modeMap[frontendMode] || 'cool'; // 默认制冷
  }

  getCommandConfigCommands(commandConfig) {
    if (commandConfig?.commands) {
      return commandConfig.commands;
    }
    if (commandConfig?.command_config?.commands) {
      return commandConfig.command_config.commands;
    }
    return null;
  }

  applyCommunicationFields(controlCommand, device) {
    if (controlCommand.uuid !== undefined) {
      controlCommand.uuid = device.communication_imei || device.imei;
    }
    if (controlCommand.body && !controlCommand.body.id) {
      controlCommand.body.id = [device.thermostat_unit_id || 1];
    }
    return controlCommand;
  }

  /**
   * 构建设备的MQTT主题
   * @param {Object} device - 设备信息
   * @returns {string} MQTT主题
   */
  buildMqttTopic(device) {
    // 温控器必须使用其所属厂商的订阅方式，其它订阅方式一律无效
    const communicationImei = device.communication_imei || device.imei;
    const manufacturerCode = device.communication_manufacturer_code || device.manufacturer_code;
    const subscriptionType = device.communication_subscription_type || device.subscription_type;

    if (!communicationImei || !manufacturerCode || !subscriptionType) {
      throw new Error(`温控器设备 ${device.device_id} 缺少必要的通信配置信息 (imei: ${communicationImei}, manufacturer_code: ${manufacturerCode}, subscription_type: ${subscriptionType})`);
    }

    try {
      // 构建设备对象，包含厂商信息
      const deviceWithManufacturer = {
        device_id: device.communication_device_id || device.device_id,
        imei: communicationImei,
        manufacturer: {
          code: manufacturerCode,
          subscription_type: subscriptionType
        }
      };
      
      const mqttConfig = mqttConfigService.buildDeviceConfig(deviceWithManufacturer);
      
      // 获取订阅主题（用于发送控制命令）
      if (mqttConfig.subscribe_topics && mqttConfig.subscribe_topics.length > 0) {
        return mqttConfig.subscribe_topics[0].topic;
      }
      
      throw new Error('无法获取有效的MQTT控制主题');
    } catch (error) {
      logger.error('构建MQTT主题失败:', error);
      throw new Error(`无法为温控器设备 ${device.device_id} 构建MQTT主题: ${error.message}`);
    }
  }

  /**
   * 开启温控器
   */
  async powerOnDevice(deviceId, settings = {}, tenantId, userId) {
    const { target_temp, humidity, mode, fan_speed } = settings;
    
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        throw new Error('温控器设备不存在');
      }

      // 检查协议配置
      if (!device.command_config) {
        throw new Error('设备协议配置不存在');
      }

      const commandConfig = device.command_config;
      const commands = this.getCommandConfigCommands(commandConfig);
      if (!commands) {
        throw new Error('协议配置中缺少commands对象');
      }
      
      const turnOnCommand = commands.power_on;
      
      if (!turnOnCommand) {
        throw new Error('协议配置中缺少开机命令');
      }

      // 构建控制命令 - 简化为只控制开关机
      const controlCommand = JSON.parse(JSON.stringify(turnOnCommand.template)); // 深拷贝协议配置的template
      
      this.applyCommunicationFields(controlCommand, device);
      
      // 只设置开机命令，根据协议规范使用setOn字段
      controlCommand.body.setOn = 1; // 1开机，0关机
      
      // 发送MQTT控制命令
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        
        // 详细的控制日志
        logger.info('🚀 温控器开机控制命令发送:', {
          deviceId: device.id,
          deviceName: device.name,
          imei: device.communication_imei || device.imei,
          manufacturerCode: device.communication_manufacturer_code || device.manufacturer_code,
          subscriptionType: device.communication_subscription_type || device.subscription_type,
          mqttTopic: topic,
          command: controlCommand,
          commandString: JSON.stringify(controlCommand),
          timestamp: new Date().toISOString()
        });
        
        await mqttService.publish(topic, JSON.stringify(controlCommand));
        
        logger.info('✅ MQTT消息已发布到主题:', {
          topic: topic,
          messageLength: JSON.stringify(controlCommand).length,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('❌ MQTT服务不可用:', {
          mqttServiceExists: !!mqttService,
          publishMethodExists: !!(mqttService && mqttService.publish),
          deviceId: device.id
        });
      }

      // 更新设备属性
      const updateFields = ['power_status = true', 'updated_at = NOW()'];
      const updateValues = [];
      let paramIndex = 1;
      
      if (target_temp !== undefined) {
        updateFields.push(`target_temp = $${paramIndex++}`);
        updateValues.push(target_temp);
      }
      if (mode !== undefined) {
        updateFields.push(`ac_mode = $${paramIndex++}`);
        updateValues.push(this.convertModeToDatabase(mode));
      }
      // fan_speed字段在数据库中不存在，只在MQTT协议中使用
      
      updateValues.push(device.id); // 使用设备的UUID而不是IMEI
      const updateQuery = `
        UPDATE thermostat_properties 
        SET ${updateFields.join(', ')}
        WHERE device_id = $${paramIndex}
      `;
      await db.query(updateQuery, updateValues);

      // 记录控制日志
      await this.logControlAction(device.id, userId, 'power_on', controlCommand, tenantId);

      // 通过WebSocket通知状态变更
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'thermostat_controlled', {
          deviceId: device.id,
          action: 'power_on',
          settings: controlCommand
        });
      }

      return controlCommand;
    } catch (error) {
      logger.error('开启温控器失败:', error);
      throw error;
    }
  }

  /**
   * 关闭温控器
   */
  async powerOffDevice(deviceId, tenantId, userId) {
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        throw new Error('温控器设备不存在');
      }

      // 检查协议配置
      if (!device.command_config) {
        throw new Error('设备协议配置不存在');
      }

      const commandConfig = device.command_config;
      const turnOffCommand = this.getCommandConfigCommands(commandConfig)?.power_off;
      
      if (!turnOffCommand) {
        throw new Error('协议配置中缺少关机命令');
      }

      // 构建控制命令 - 使用协议配置的template
      const controlCommand = JSON.parse(JSON.stringify(turnOffCommand.template)); // 深拷贝协议配置的template
      
      this.applyCommunicationFields(controlCommand, device);
      
      // 设置关机状态
      controlCommand.body.setOn = 0;
      
      // 发送MQTT控制命令
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        
        // 详细的控制日志
        logger.info('🔴 温控器关机控制命令发送:', {
          deviceId: device.id,
          deviceName: device.name,
          imei: device.communication_imei || device.imei,
          manufacturerCode: device.communication_manufacturer_code || device.manufacturer_code,
          subscriptionType: device.communication_subscription_type || device.subscription_type,
          mqttTopic: topic,
          command: controlCommand,
          commandString: JSON.stringify(controlCommand),
          timestamp: new Date().toISOString()
        });
        
        await mqttService.publish(topic, JSON.stringify(controlCommand));
        
        logger.info('✅ MQTT消息已发布到主题:', {
          topic: topic,
          messageLength: JSON.stringify(controlCommand).length,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('❌ MQTT服务不可用:', {
          mqttServiceExists: !!mqttService,
          publishMethodExists: !!(mqttService && mqttService.publish),
          deviceId: device.id
        });
      }

      // 更新设备属性
      const updateQuery = `
        UPDATE thermostat_properties 
        SET power_status = false, updated_at = NOW()
        WHERE device_id = $1
      `;
      await db.query(updateQuery, [deviceId]);

      // 记录控制日志
      await this.logControlAction(deviceId, userId, 'power_off', controlCommand, tenantId);

      // 通过WebSocket通知状态变更
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'thermostat_controlled', {
          deviceId,
          device_id: deviceId,
          action: 'power_off'
        });
      }

      return controlCommand;
    } catch (error) {
      logger.error('关闭温控器失败:', error);
      throw error;
    }
  }

  /**
   * 设置目标温度
   */
  async setTemperature(deviceId, targetTemp, tenantId, userId) {
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        throw new Error('温控器设备不存在');
      }

      // 注释掉温度锁定检查，允许远程控制
      // if (device.last_data_time) {
      //   throw new Error('温度已被锁定，无法调节');
      // }

      // 检查协议配置
      if (!device.command_config) {
        throw new Error('设备协议配置不存在');
      }

      const commandConfig = device.command_config;
      const setTempCommand = this.getCommandConfigCommands(commandConfig)?.set_temperature;
      
      if (!setTempCommand) {
        throw new Error('协议配置中缺少设置温度命令');
      }

      // 构建控制命令 - 使用协议配置的template
      const controlCommand = JSON.parse(JSON.stringify(setTempCommand.template)); // 深拷贝协议配置的template
      
      this.applyCommunicationFields(controlCommand, device);
      
      // 设置温度值 - 根据协议配置中的字段名
      if (controlCommand.body && controlCommand.body.setTemp !== undefined) {
        controlCommand.body.setTemp = Math.round(targetTemp * 10); // 设定温度，单位0.1℃，需要乘以10
      }
      
      // 移除setOn字段 - 设置温度时不应该包含开机状态控制
      if (controlCommand.body && controlCommand.body.hasOwnProperty('setOn')) {
        delete controlCommand.body.setOn;
      }
      
      // 发送MQTT控制命令
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        
        // 详细的控制日志
        logger.info('🌡️ 温控器温度设置命令发送:', {
          deviceId: device.id,
          deviceName: device.name,
          imei: device.communication_imei || device.imei,
          manufacturerCode: device.communication_manufacturer_code || device.manufacturer_code,
          subscriptionType: device.communication_subscription_type || device.subscription_type,
          targetTemperature: targetTemp,
          protocolTempValue: Math.round(targetTemp * 10),
          mqttTopic: topic,
          command: controlCommand,
          commandString: JSON.stringify(controlCommand),
          timestamp: new Date().toISOString()
        });
        
        await mqttService.publish(topic, JSON.stringify(controlCommand));
        
        logger.info('✅ MQTT消息已发布到主题:', {
          topic: topic,
          messageLength: JSON.stringify(controlCommand).length,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('❌ MQTT服务不可用:', {
          mqttServiceExists: !!mqttService,
          publishMethodExists: !!(mqttService && mqttService.publish),
          deviceId: device.id
        });
      }

      // 更新设备属性
      const updateQuery = `
      UPDATE thermostat_properties 
      SET target_temp = $1, updated_at = NOW() 
      WHERE device_id = $2
    `;
      await db.query(updateQuery, [targetTemp, deviceId]);

      // 记录控制日志
      await this.logControlAction(deviceId, userId, 'set_temperature', controlCommand, tenantId);

      // 通过WebSocket通知状态变更
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'thermostat_controlled', {
          deviceId,
          device_id: deviceId,
          action: 'set_temperature',
          target_temp: targetTemp
        });
      }

      return controlCommand;
    } catch (error) {
      logger.error('设置温度失败:', error);
      throw error;
    }
  }

  /**
   * 设置风速
   */
  async setFanSpeed(deviceId, fanSpeed, tenantId, userId) {
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        throw new Error('温控器设备不存在');
      }

      // 检查协议配置
      if (!device.command_config) {
        throw new Error('设备协议配置不存在');
      }

      const commandConfig = device.command_config;
      const setFanSpeedCommand = this.getCommandConfigCommands(commandConfig)?.set_fan_speed;
      
      if (!setFanSpeedCommand) {
        throw new Error('协议配置中缺少设置风速命令');
      }

      // 构建控制命令 - 使用协议配置的template
      const controlCommand = JSON.parse(JSON.stringify(setFanSpeedCommand.template)); // 深拷贝协议配置的template
      
      this.applyCommunicationFields(controlCommand, device);
      
      // 设置风速值 - 根据协议配置中的字段名
      if (controlCommand.body && controlCommand.body.setFanSpeed !== undefined) {
        controlCommand.body.setFanSpeed = fanSpeed;
      }
      
      // 移除setOn字段 - 设置风速时不应该包含开机状态控制
      if (controlCommand.body && controlCommand.body.hasOwnProperty('setOn')) {
        delete controlCommand.body.setOn;
      }
      
      // 发送MQTT控制命令
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        
        // 详细的控制日志
        logger.info('💨 温控器风速设置命令发送:', {
          deviceId: device.id,
          deviceName: device.name,
          imei: device.communication_imei || device.imei,
          manufacturerCode: device.communication_manufacturer_code || device.manufacturer_code,
          subscriptionType: device.communication_subscription_type || device.subscription_type,
          fanSpeed: fanSpeed,
          mqttTopic: topic,
          command: controlCommand,
          commandString: JSON.stringify(controlCommand),
          timestamp: new Date().toISOString()
        });
        
        await mqttService.publish(topic, JSON.stringify(controlCommand));
        
        logger.info('✅ MQTT消息已发布到主题:', {
          topic: topic,
          messageLength: JSON.stringify(controlCommand).length,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('❌ MQTT服务不可用:', {
          mqttServiceExists: !!mqttService,
          publishMethodExists: !!(mqttService && mqttService.publish),
          deviceId: device.id
        });
      }

      // 更新数据库中的fan_speed字段
      try {
        const updateQuery = `
          UPDATE thermostat_properties 
          SET fan_speed = $1, updated_at = NOW() 
          WHERE device_id = $2
        `;
        await pool.query(updateQuery, [fanSpeed, deviceId]);
        
        logger.info('✅ 数据库风速字段更新成功:', {
          deviceId: deviceId,
          fanSpeed: fanSpeed,
          timestamp: new Date().toISOString()
        });
      } catch (dbError) {
        logger.error('❌ 数据库风速字段更新失败:', {
          deviceId: deviceId,
          fanSpeed: fanSpeed,
          error: dbError.message
        });
        // 数据库更新失败不影响MQTT命令发送，继续执行
      }

      // 记录控制日志
      await this.logControlAction(deviceId, userId, 'set_fan_speed', controlCommand, tenantId);

      // 通过WebSocket通知状态变更
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'thermostat_controlled', {
          deviceId,
          device_id: deviceId,
          action: 'set_fan_speed',
          fan_speed: fanSpeed
        });
      }

      return controlCommand;
    } catch (error) {
      logger.error('设置风速失败:', error);
      throw error;
    }
  }

  /**
   * 设置空调模式
   */
  async setMode(deviceId, acMode, tenantId, userId) {
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        throw new Error('温控器设备不存在');
      }

      // 检查协议配置
      if (!device.command_config) {
        throw new Error('设备协议配置不存在');
      }

      const commandConfig = device.command_config;
      const setModeCommand = this.getCommandConfigCommands(commandConfig)?.set_mode;
      
      if (!setModeCommand) {
        throw new Error('协议配置中缺少设置模式命令');
      }

      // 构建控制命令 - 使用协议配置的template
      const controlCommand = JSON.parse(JSON.stringify(setModeCommand.template)); // 深拷贝协议配置的template
      
      this.applyCommunicationFields(controlCommand, device);
      
      // 设置模式值 - 根据协议配置中的字段名
      if (controlCommand.body && controlCommand.body.setMode !== undefined) {
        controlCommand.body.setMode = this.convertModeToProtocol(acMode);
      }
      
      // 移除setOn字段 - 设置模式时不应该包含开机状态控制
      if (controlCommand.body && controlCommand.body.hasOwnProperty('setOn')) {
        delete controlCommand.body.setOn;
      }
      
      // 发送MQTT控制命令
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        
        // 详细的控制日志
        logger.info('🔄 温控器模式设置命令发送:', {
          deviceId: device.id,
          deviceName: device.name,
          imei: device.communication_imei || device.imei,
          manufacturerCode: device.communication_manufacturer_code || device.manufacturer_code,
          subscriptionType: device.communication_subscription_type || device.subscription_type,
          acMode: acMode,
          protocolMode: this.convertModeToProtocol(acMode),
          mqttTopic: topic,
          command: controlCommand,
          commandString: JSON.stringify(controlCommand),
          timestamp: new Date().toISOString()
        });
        
        await mqttService.publish(topic, JSON.stringify(controlCommand));
        
        logger.info('✅ MQTT消息已发布到主题:', {
          topic: topic,
          messageLength: JSON.stringify(controlCommand).length,
          timestamp: new Date().toISOString()
        });
      } else {
        logger.error('❌ MQTT服务不可用:', {
          mqttServiceExists: !!mqttService,
          publishMethodExists: !!(mqttService && mqttService.publish),
          deviceId: device.id
        });
      }

      // 更新设备属性 - 转换前端模式到数据库格式
      const dbMode = this.convertModeToDatabase(acMode);
      const updateQuery = `
        UPDATE thermostat_properties 
        SET ac_mode = $1, updated_at = NOW()
        WHERE device_id = $2
      `;
      await db.query(updateQuery, [dbMode, deviceId]);

      // 记录控制日志
      await this.logControlAction(deviceId, userId, 'set_mode', controlCommand, tenantId);

      // 通过WebSocket通知状态变更
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'thermostat_controlled', {
          deviceId,
          action: 'set_mode',
          mode: acMode
        });
      }

      return controlCommand;
    } catch (error) {
      logger.error('设置模式失败:', error);
      throw error;
    }
  }

  /**
   * 锁定/解锁温度
   */
  /**
   * 切换童锁状态 - 锁定/解锁温控器现场控制
   * 当童锁开启时，温控器现场面板将无法操作，只能通过远程控制
   */
  async toggleTempLock(deviceId, locked, tenantId, userId) {
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        throw new Error('温控器设备不存在');
      }

      // 检查协议配置
      if (!device.command_config) {
        throw new Error('设备协议配置不存在');
      }

      const commandConfig = device.command_config;
      const setLockCommand = this.getCommandConfigCommands(commandConfig)?.set_lock;
      
      if (!setLockCommand) {
        throw new Error('协议配置中缺少童锁控制命令');
      }

      // 构建控制命令 - 使用协议配置的template
      const controlCommand = JSON.parse(JSON.stringify(setLockCommand.template)); // 深拷贝协议配置的template
      
      this.applyCommunicationFields(controlCommand, device);
      
      // 设置童锁状态 - 根据协议配置中的字段名
      if (controlCommand.body && controlCommand.body.lock !== undefined) {
        controlCommand.body.lock = locked ? 1 : 0; // 童锁控制：1-锁定现场控制，0-解锁现场控制
      }
      
      // 发送MQTT控制命令
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        await mqttService.publish(topic, JSON.stringify(controlCommand));
        logger.info(`发送童锁控制命令到设备 ${deviceId}:`, {
          topic,
          command: controlCommand,
          action: locked ? '锁定现场控制' : '解锁现场控制'
        });
      }

      // 更新设备属性 - 记录童锁状态
      const updateQuery = `
        UPDATE thermostat_properties 
        SET last_data_time = NOW(), updated_at = NOW()
        WHERE device_id = $1
      `;
      await db.query(updateQuery, [deviceId]);

      // 记录控制日志
      await this.logControlAction(deviceId, userId, locked ? 'lock_device' : 'unlock_device', controlCommand, tenantId);

      // 通过WebSocket通知状态变更
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'thermostat_controlled', {
          deviceId,
          device_id: deviceId,
          action: locked ? 'lock_device' : 'unlock_device',
          locked,
          message: locked ? '温控器现场控制已锁定' : '温控器现场控制已解锁'
        });
      }

      return controlCommand;
    } catch (error) {
      logger.error('童锁操作失败:', error);
      throw error;
    }
  }

  /**
   * 读取设备状态
   * 注意：为避免读取命令导致设备进入待机状态，此方法不再发送MQTT命令
   * 而是直接返回缓存的设备状态数据
   */
  async getDeviceStatus(deviceId, tenantId, userId) {
    try {
      // 检查设备是否存在并获取当前状态
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        return {
          success: false,
          message: '温控器设备不存在'
        };
      }

      // 获取缓存的实时状态数据
      const cachedStatus = this.getDeviceStatusCache(device.id);
      
      // 记录查询日志（不发送MQTT命令）
      await this.logControlAction(deviceId, userId, 'query_status', { action: 'get_cached_status' }, tenantId);
      
      // 返回设备当前状态信息
      const statusData = {
        deviceId: device.id,
        deviceName: device.name,
        imei: device.imei,
        status: device.status,
        location: device.location,
        // 温控器状态信息
        currentTemperature: device.current_temperature || null,
        targetTemperature: device.target_temp || 26,
        mode: device.mode || 'cool',
        isOn: device.power_status || false,
        humidity: device.humidity || null,
        fanSpeed: cachedStatus.fanSpeed !== undefined ? cachedStatus.fanSpeed : 0,
        acMode: device.acMode || device.mode || 'cool',
        // 分组信息
        groupId: device.group_id,
        groupName: device.group_name,
        groupDescription: device.group_description,
        // 设备信息
        manufacturerCode: device.manufacturer_code,
        subscriptionType: device.subscription_type,
        protocolConfigId: device.protocol_config_id,
        commandConfig: device.command_config,
        createdAt: device.created_at,
        updatedAt: device.updated_at
      };

      return {
        success: true,
        data: statusData,
        message: '设备状态查询成功，返回缓存数据'
      };
    } catch (error) {
      logger.error('设备状态查询失败:', error);
      return {
        success: false,
        message: '设备状态查询失败: ' + error.message
      };
    }
  }

  /**
   * 强制同步设备状态
   * 发送MQTT读取命令获取设备最新状态（可能影响设备运行状态）
   */
  async forceRefreshDeviceStatus(deviceId, tenantId, userId) {
    try {
      // 检查设备是否存在并获取当前状态
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        return {
          success: false,
          message: '温控器设备不存在'
        };
      }

      // 构建读取状态命令 - 根据协议文档格式
      const readCommand = {
        uuid: device.communication_imei || device.imei,
        pType: "params",
        func: "read",
        body: {
          id: [device.thermostat_unit_id || 1],
          items: []  // 空数组表示读取所有项目
        }
      };

      // 发送MQTT读取命令以获取最新状态
      if (mqttService && mqttService.publish) {
        const topic = this.buildMqttTopic(device);
        await mqttService.publish(topic, JSON.stringify(readCommand));
      }

      // 记录控制日志
      await this.logControlAction(deviceId, userId, 'force_refresh_status', readCommand, tenantId);

      return {
        success: true,
        message: '强制同步命令已发送，请稍后查看设备状态更新'
      };
    } catch (error) {
      logger.error('强制同步设备状态失败:', error);
      return {
        success: false,
        message: '强制同步设备状态失败: ' + error.message
      };
    }
  }

  /**
   * 获取设备协议配置
   */
  async getDeviceProtocolConfig(deviceId, tenantId, userId) {
    try {
      // 检查设备是否存在
      const device = await this.getThermostatDevice(deviceId, tenantId);
      if (!device) {
        return {
          success: false,
          message: '温控器设备不存在'
        };
      }

      // 获取设备的协议配置
      const query = `
        SELECT 
          pc.id,
          pc.name,
          pc.protocol_type,
          pc.data_parsing_config,
          pc.command_config,
          pc.validation_rules,
          pc.status,
          pc.created_at,
          pc.updated_at
        FROM devices d
        JOIN protocol_configs pc ON d.protocol_config_id = pc.id
        WHERE d.device_id = $1 AND d.tenant_id = $2
      `;

      const result = await db.query(query, [deviceId, tenantId]);
      
      if (result.rows.length === 0) {
        return {
          success: false,
          message: '设备协议配置不存在'
        };
      }

      const protocolConfig = result.rows[0];

      return {
        success: true,
        data: {
          deviceId: deviceId,
          protocolConfig: {
            id: protocolConfig.id,
            name: protocolConfig.name,
            protocolType: protocolConfig.protocol_type,
            dataParsingConfig: protocolConfig.data_parsing_config,
            commandConfig: protocolConfig.command_config,
            validationRules: protocolConfig.validation_rules,
            status: protocolConfig.status,
            createdAt: protocolConfig.created_at,
            updatedAt: protocolConfig.updated_at
          }
        },
        message: '设备协议配置获取成功'
      };
    } catch (error) {
      logger.error('设备协议配置获取失败:', error);
      return {
        success: false,
        message: '设备协议配置获取失败: ' + error.message
      };
    }
  }

  // ============================================
  // 开关机计划管理
  // ============================================

  /**
   * 获取设备的计划列表
   */
  async getDeviceSchedules(deviceId, tenantId) {
    const query = `
      SELECT ts.*, d.name as device_name
      FROM thermostat_schedules ts
      JOIN devices d ON ts.device_id = d.id
      WHERE ts.device_id = $1 AND d.tenant_id = $2
      ORDER BY ts.created_at DESC
    `;

    try {
      const result = await db.query(query, [deviceId, tenantId]);
      return result.rows;
    } catch (error) {
      logger.error('获取设备计划失败:', error);
      throw error;
    }
  }

  /**
   * 创建计划
   */
  async createSchedule(deviceId, scheduleData, tenantId) {
    // 验证设备是否属于该租户
    const deviceCheck = await db.query(
      'SELECT id FROM devices WHERE id = $1 AND tenant_id = $2 AND device_type = $3',
      [deviceId, tenantId, 'thermostat']
    );
    
    if (deviceCheck.rows.length === 0) {
      throw new Error('设备不存在或无权限');
    }

    const query = `
      INSERT INTO thermostat_schedules (
        device_id, name, schedule_type, days_of_week, time, 
        action, settings, enabled
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        deviceId,
        scheduleData.name,
        scheduleData.schedule_type,
        scheduleData.days_of_week,
        scheduleData.time,
        scheduleData.action,
        JSON.stringify(scheduleData.settings),
        scheduleData.enabled !== false
      ]);
      
      return result.rows[0];
    } catch (error) {
      logger.error('创建计划失败:', error);
      throw error;
    }
  }

  /**
   * 更新计划
   */
  async updateSchedule(scheduleId, scheduleData, tenantId) {
    const query = `
      UPDATE thermostat_schedules 
      SET 
        name = $1,
        schedule_type = $2,
        days_of_week = $3,
        time = $4,
        action = $5,
        settings = $6,
        enabled = $7,
        updated_at = NOW()
      WHERE id = $8 
      AND device_id IN (
        SELECT d.id FROM devices d 
        WHERE d.tenant_id = $9 AND d.device_type = 'thermostat'
      )
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        scheduleData.name,
        scheduleData.schedule_type,
        scheduleData.days_of_week,
        scheduleData.time,
        scheduleData.action,
        JSON.stringify(scheduleData.settings),
        scheduleData.enabled,
        scheduleId,
        tenantId
      ]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('更新计划失败:', error);
      throw error;
    }
  }

  /**
   * 删除计划
   */
  async deleteSchedule(scheduleId, tenantId) {
    const query = `
      DELETE FROM thermostat_schedules 
      WHERE id = $1 
      AND device_id IN (
        SELECT d.id FROM devices d 
        WHERE d.tenant_id = $2 AND d.device_type = 'thermostat'
      )
    `;

    try {
      const result = await db.query(query, [scheduleId, tenantId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('删除计划失败:', error);
      throw error;
    }
  }

  /**
   * 启用/禁用计划
   */
  async toggleSchedule(scheduleId, enabled, tenantId) {
    const query = `
      UPDATE thermostat_schedules 
      SET enabled = $1, updated_at = NOW()
      WHERE id = $2 
      AND device_id IN (
        SELECT d.id FROM devices d 
        WHERE d.tenant_id = $3 AND d.device_type = 'thermostat'
      )
      RETURNING *
    `;

    try {
      const result = await db.query(query, [enabled, scheduleId, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('切换计划状态失败:', error);
      throw error;
    }
  }

  // ============================================
  // 运行统计
  // ============================================

  /**
   * 获取设备运行统计
   */
  async getDeviceStats(deviceId, date, tenantId) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT trs.*, d.name as device_name
      FROM thermostat_runtime_stats trs
      JOIN devices d ON trs.device_id = d.id
      WHERE trs.device_id = $1 AND trs.stat_date = $2 AND d.tenant_id = $3
    `;

    try {
      const result = await db.query(query, [deviceId, targetDate, tenantId]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error('获取设备统计失败:', error);
      throw error;
    }
  }

  /**
   * 获取设备运行统计（按日期范围）
   */
  async getDeviceStatsRange(deviceId, startDate, endDate, tenantId) {
    const query = `
      SELECT trs.*, d.name as device_name
      FROM thermostat_runtime_stats trs
      JOIN devices d ON trs.device_id = d.id
      WHERE trs.device_id = $1 
      AND trs.stat_date BETWEEN $2 AND $3 
      AND d.tenant_id = $4
      ORDER BY trs.stat_date DESC
    `;

    try {
      const result = await db.query(query, [deviceId, startDate, endDate, tenantId]);
      return result.rows;
    } catch (error) {
      logger.error('获取设备统计范围失败:', error);
      throw error;
    }
  }

  /**
   * 获取租户下所有设备统计汇总
   */
  async getTenantStatsSummary(tenantId, date) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        COUNT(DISTINCT trs.device_id) as total_devices,
        SUM(trs.total_runtime) as total_runtime,
        AVG(trs.avg_temp) as avg_temperature,
        SUM(trs.power_on_count) as total_power_cycles,
        SUM(trs.runtime_cool) as total_runtime_cool,
        SUM(trs.runtime_heat) as total_runtime_heat,
        SUM(trs.runtime_fan) as total_runtime_fan
      FROM thermostat_runtime_stats trs
      JOIN devices d ON trs.device_id = d.id
      WHERE trs.stat_date = $1 AND d.tenant_id = $2
    `;

    try {
      const result = await db.query(query, [targetDate, tenantId]);
      return result.rows[0];
    } catch (error) {
      logger.error('获取租户统计汇总失败:', error);
      throw error;
    }
  }

  /**
   * 获取运行统计数据（支持运行模式过滤）
   */
  async getRunningStats(tenantId, options = {}) {
    const {
      dateRange = [],
      deviceId = null,
      groupId = null,
      mode = null
    } = options;

    const endDate = dateRange?.[1] || new Date().toISOString().slice(0, 10);
    const defaultStart = new Date(`${endDate}T00:00:00`);
    defaultStart.setDate(defaultStart.getDate() - 29);
    const startDate = dateRange?.[0] || defaultStart.toISOString().slice(0, 10);
    const params = [startDate, endDate, tenantId || null];
    const filters = [];

    if (deviceId) {
      params.push(deviceId);
      filters.push(`tsm.device_id IN (
        SELECT id
        FROM devices
        WHERE id::text = $${params.length}
          OR device_id = $${params.length}
          OR imei = $${params.length}
      )`);
    }

    if (groupId) {
      params.push(groupId);
      filters.push(`tp.group_id = $${params.length}`);
    }

    if (mode && mode !== 'all') {
      params.push(mode);
      filters.push(`LOWER(COALESCE(tsm.mode, '')) = LOWER($${params.length})`);
    }

    const extraFilters = filters.length ? `AND ${filters.join(' AND ')}` : '';

    const query = `
      WITH bounds AS (
        SELECT
          ($1::date::timestamp AT TIME ZONE 'Asia/Shanghai') AS range_start,
          (($2::date + 1)::timestamp AT TIME ZONE 'Asia/Shanghai') AS range_end
      ), ordered AS (
        SELECT
          tsm.device_id,
          d.name AS device_name,
          d.location,
          tg.name AS group_name,
          tsm.measured_at,
          tsm.power_status,
          LOWER(TRIM(COALESCE(tsm.fan_speed, ''))) AS fan_speed,
          LEAD(tsm.measured_at) OVER (
            PARTITION BY tsm.device_id ORDER BY tsm.measured_at
          ) AS next_measured_at,
          b.range_start,
          b.range_end
        FROM thermostat_status_measurements tsm
        JOIN devices d ON d.id = tsm.device_id
        LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
        LEFT JOIN thermostat_groups tg ON tp.group_id = tg.id
        CROSS JOIN bounds b
        WHERE tsm.measured_at >= b.range_start - INTERVAL '30 minutes'
          AND tsm.measured_at < b.range_end
          AND ($3::uuid IS NULL OR d.tenant_id = $3::uuid)
          ${extraFilters}
      ), segments AS (
        SELECT *,
          GREATEST(measured_at, range_start) AS segment_start,
          LEAST(
            COALESCE(next_measured_at, LEAST(NOW(), range_end)),
            measured_at + INTERVAL '30 minutes',
            range_end
          ) AS segment_end
        FROM ordered
      )
      SELECT
        device_id,
        device_name,
        location,
        group_name,
        TO_CHAR(segment_start AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD') AS stat_date,
        ROUND(SUM(CASE
          WHEN power_status IS TRUE AND fan_speed IN ('1', 'low', '低', '低速')
          THEN GREATEST(EXTRACT(EPOCH FROM segment_end - segment_start), 0) ELSE 0 END))::bigint AS runtime_speed1,
        ROUND(SUM(CASE
          WHEN power_status IS TRUE AND fan_speed IN ('2', 'medium', 'middle', '中', '中速')
          THEN GREATEST(EXTRACT(EPOCH FROM segment_end - segment_start), 0) ELSE 0 END))::bigint AS runtime_speed2,
        ROUND(SUM(CASE
          WHEN power_status IS TRUE AND fan_speed IN ('3', 'high', '高', '高速')
          THEN GREATEST(EXTRACT(EPOCH FROM segment_end - segment_start), 0) ELSE 0 END))::bigint AS runtime_speed3,
        MIN(measured_at) AS created_at,
        MAX(measured_at) AS updated_at
      FROM segments
      WHERE segment_end > segment_start
        AND segment_start >= range_start
        AND segment_start < range_end
      GROUP BY device_id, device_name, location, group_name,
        TO_CHAR(segment_start AT TIME ZONE 'Asia/Shanghai', 'YYYY-MM-DD')
      ORDER BY stat_date ASC, COALESCE(device_name, device_id::text) ASC
    `;

    try {
      const result = await db.query(query, params);
      
      // 处理运行时间数据，将数据库字段转换为前端需要的格式
      let filteredData = result.rows.map(row => ({
        ...row,
        // 将数据库字段映射到前端字段
        runtime_speed1: parseInt(row.runtime_speed1) || 0,
        runtime_speed2: parseInt(row.runtime_speed2) || 0,
        runtime_speed3: parseInt(row.runtime_speed3) || 0,
        // 为兼容性添加旧字段名
        runtime_fan: parseInt(row.runtime_speed1) || 0,
        runtime_cool: parseInt(row.runtime_speed2) || 0,
        runtime_heat: parseInt(row.runtime_speed3) || 0
      }));
      
      return filteredData;
    } catch (error) {
      logger.error('获取运行统计数据失败:', error);
      throw error;
    }
  }

  // ============================================
  // 情景模式
  // ============================================

  /**
   * 获取情景模式列表
   */
  async getScenes(tenantId) {
    const query = `
      SELECT * FROM thermostat_scenes
      WHERE tenant_id = $1
      ORDER BY scene_type, created_at DESC
    `;

    try {
      const result = await db.query(query, [tenantId]);
      return result.rows;
    } catch (error) {
      logger.error('获取情景模式列表失败:', error);
      throw error;
    }
  }

  /**
   * 创建自定义情景模式
   */
  async createScene(sceneData, tenantId) {
    const query = `
      INSERT INTO thermostat_scenes (
        name, description, scene_type, settings, tenant_id
      )
      VALUES ($1, $2, 'custom', $3, $4)
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        sceneData.name,
        sceneData.description,
        JSON.stringify(sceneData.settings),
        tenantId
      ]);
      
      return result.rows[0];
    } catch (error) {
      logger.error('创建情景模式失败:', error);
      throw error;
    }
  }

  /**
   * 更新情景模式
   */
  async updateScene(sceneId, sceneData, tenantId) {
    const query = `
      UPDATE thermostat_scenes 
      SET 
        name = $1,
        description = $2,
        settings = $3,
        updated_at = NOW()
      WHERE id = $4 AND tenant_id = $5 AND scene_type = 'custom'
      RETURNING *
    `;

    try {
      const result = await db.query(query, [
        sceneData.name,
        sceneData.description,
        JSON.stringify(sceneData.settings),
        sceneId,
        tenantId
      ]);
      
      return result.rows[0] || null;
    } catch (error) {
      logger.error('更新情景模式失败:', error);
      throw error;
    }
  }

  /**
   * 删除情景模式
   */
  async deleteScene(sceneId, tenantId) {
    const query = `
      DELETE FROM thermostat_scenes 
      WHERE id = $1 AND tenant_id = $2 AND scene_type = 'custom'
    `;

    try {
      const result = await db.query(query, [sceneId, tenantId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('删除情景模式失败:', error);
      throw error;
    }
  }

  /**
   * 执行情景模式
   */
  async executeScene(sceneId, deviceIds, tenantId, userId) {
    try {
      // 获取情景模式
      const sceneQuery = `
        SELECT * FROM thermostat_scenes
        WHERE id = $1 AND tenant_id = $2
      `;
      const sceneResult = await db.query(sceneQuery, [sceneId, tenantId]);
      
      if (sceneResult.rows.length === 0) {
        throw new Error('情景模式不存在');
      }

      const scene = sceneResult.rows[0];
      const settings = scene.settings;
      const results = [];
      const errors = [];

      // 应用到指定设备
      for (const deviceId of deviceIds) {
        try {
          const device = await this.getThermostatDevice(deviceId, tenantId);
          if (!device) {
            errors.push({ deviceId, error: '设备不存在' });
            continue;
          }

          // 构建控制命令
          const controlCommand = {
            device_id: device.device_id,
            action: 'apply_scene',
            scene_id: sceneId,
            scene_name: scene.name,
            ...settings,
            timestamp: new Date().toISOString()
          };

          // 发送MQTT控制命令
          if (mqttService && mqttService.publish) {
            const topic = this.buildMqttTopic(device);
            await mqttService.publish(topic, JSON.stringify(controlCommand));
          }

          // 更新设备属性
          if (settings.target_temp || settings.mode || settings.humidity || settings.is_on !== undefined) {
            const updateFields = [];
            const updateValues = [];
            let paramIndex = 1;

            if (settings.target_temp) {
          updateFields.push(`target_temp = $${paramIndex++}`);
          updateValues.push(settings.target_temp);
            }
            if (settings.mode) {
          updateFields.push(`mode = $${paramIndex++}`);
          updateValues.push(this.convertModeToDatabase(settings.mode));
            }
            if (settings.humidity) {
          updateFields.push(`humidity = $${paramIndex++}`);
          updateValues.push(settings.humidity);
            }
            if (settings.is_on !== undefined) {
          updateFields.push(`is_on = $${paramIndex++}`);
          updateValues.push(settings.is_on);
            }

            updateFields.push(`updated_at = NOW()`);
            updateValues.push(deviceId);

            const updateQuery = `
              UPDATE thermostat_properties 
              SET ${updateFields.join(', ')}
              WHERE device_id = $${paramIndex}
            `;
            
            await db.query(updateQuery, updateValues);
          }

          // 记录控制日志
          await this.logControlAction(deviceId, userId, 'apply_scene', controlCommand, tenantId);

          results.push({ deviceId, status: 'success' });
        } catch (error) {
          logger.error(`应用情景模式到设备 ${deviceId} 失败:`, error);
          errors.push({ deviceId, error: error.message });
        }
      }

      // 通过WebSocket通知情景模式执行
      if (websocketService && websocketService.broadcastToTenant) {
        websocketService.broadcastToTenant(tenantId, 'scene_executed', {
          sceneId,
          sceneName: scene.name,
          results,
          errors
        });
      }

      return {
        sceneId,
        sceneName: scene.name,
        results,
        errors
      };
    } catch (error) {
      logger.error('执行情景模式失败:', error);
      throw error;
    }
  }

  // ============================================
  // 控制日志
  // ============================================

  /**
   * 获取设备控制日志
   */
  async getDeviceLogs(deviceId, page, pageSize, tenantId) {
    const offset = (page - 1) * pageSize;
    
    const query = `
      SELECT tcl.*, tcl.action AS control_type, tcl.command AS new_value,
             (tcl.status = 'sent') AS success, u.username, d.name as device_name
      FROM thermostat_control_logs tcl
      JOIN devices d ON tcl.device_id = d.id
      LEFT JOIN users u ON tcl.user_id = u.id
      WHERE tcl.device_id = $1 AND d.tenant_id = $2
      ORDER BY tcl.created_at DESC
      LIMIT $3 OFFSET $4
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM thermostat_control_logs tcl
      JOIN devices d ON tcl.device_id = d.id
      WHERE tcl.device_id = $1 AND d.tenant_id = $2
    `;

    try {
      const [logs, countResult] = await Promise.all([
        db.query(query, [deviceId, tenantId, pageSize, offset]),
        db.query(countQuery, [deviceId, tenantId])
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / pageSize);

      return {
        list: logs.rows,
        pagination: {
          total,
          page,
          pageSize,
          totalPages
        }
      };
    } catch (error) {
      logger.error('获取设备控制日志失败:', error);
      throw error;
    }
  }

  /**
   * 获取租户控制日志
   */
  async getTenantLogs(page, pageSize, tenantId) {
    const offset = (page - 1) * pageSize;
    
    const query = `
      SELECT tcl.*, tcl.action AS control_type, tcl.command AS new_value,
             (tcl.status = 'sent') AS success, u.username, d.name as device_name
      FROM thermostat_control_logs tcl
      JOIN devices d ON tcl.device_id = d.id
      LEFT JOIN users u ON tcl.user_id = u.id
      WHERE d.tenant_id = $1
      ORDER BY tcl.created_at DESC
      LIMIT $2 OFFSET $3
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM thermostat_control_logs tcl
      JOIN devices d ON tcl.device_id = d.id
      WHERE d.tenant_id = $1
    `;

    try {
      const [logs, countResult] = await Promise.all([
        db.query(query, [tenantId, pageSize, offset]),
        db.query(countQuery, [tenantId])
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = Math.ceil(total / pageSize);

      return {
        list: logs.rows,
        pagination: {
          total,
          page,
          pageSize,
          totalPages
        }
      };
    } catch (error) {
      logger.error('获取租户控制日志失败:', error);
      throw error;
    }
  }

  // ============================================
  // 批量操作
  // ============================================

  /**
   * 批量开启设备
   */
  async batchPowerOn(deviceIds, settings, tenantId, userId) {
    const results = [];
    const errors = [];

    for (const deviceId of deviceIds) {
      try {
        const result = await this.powerOnDevice(deviceId, settings, tenantId, userId);
        results.push({ deviceId, status: 'success', result });
      } catch (error) {
        logger.error(`批量开启设备 ${deviceId} 失败:`, error);
        errors.push({ deviceId, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * 批量关闭设备
   */
  async batchPowerOff(deviceIds, tenantId, userId) {
    const results = [];
    const errors = [];

    for (const deviceId of deviceIds) {
      try {
        const result = await this.powerOffDevice(deviceId, tenantId, userId);
        results.push({ deviceId, status: 'success', result });
      } catch (error) {
        logger.error(`批量关闭设备 ${deviceId} 失败:`, error);
        errors.push({ deviceId, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * 批量设置温度
   */
  async batchSetTemperature(deviceIds, targetTemp, tenantId, userId) {
    const results = [];
    const errors = [];

    for (const deviceId of deviceIds) {
      try {
        const result = await this.setTemperature(deviceId, targetTemp, tenantId, userId);
        results.push({ deviceId, status: 'success', result });
      } catch (error) {
        logger.error(`批量设置温度 ${deviceId} 失败:`, error);
        errors.push({ deviceId, error: error.message });
      }
    }

    return { results, errors };
  }

  /**
   * 批量设置模式
   */
  async batchSetMode(deviceIds, acMode, tenantId, userId) {
    const results = [];
    const errors = [];

    for (const deviceId of deviceIds) {
      try {
        const result = await this.setMode(deviceId, acMode, tenantId, userId);
        results.push({ deviceId, status: 'success', result });
      } catch (error) {
        logger.error(`批量设置模式 ${deviceId} 失败:`, error);
        errors.push({ deviceId, error: error.message });
      }
    }

    return { results, errors };
  }

  // ============================================
  // 辅助方法
  // ============================================

  /**
   * 记录控制日志
   */
  async logControlAction(deviceId, userId, action, commandData, tenantId) {
    const query = `
      INSERT INTO thermostat_control_logs (
        tenant_id, device_id, user_id, action, command, control_source, status
      )
      VALUES ($5, $1, $2, $3, $4, 'api', 'sent')
    `;

    try {
      await db.query(query, [
        deviceId,
        userId,
        action,
        JSON.stringify(commandData),
        tenantId
      ]);
    } catch (error) {
      logger.error('记录控制日志失败:', error);
      // 不抛出错误，避免影响主要业务流程
    }
  }
}

module.exports = new ThermostatService();
