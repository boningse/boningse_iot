const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');
const mqttService = require('../services/mqttService');
const telemetryStore = require('../services/telemetryStore');

const router = express.Router();

// 数据库连接 - 使用统一的配置
const pool = new Pool(getPoolConfig());

const isAdminUser = (user) => user && user.role === 'admin';

const parseJsonField = (value) => {
  if (!value || typeof value === 'object') return value || {};
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
};

const renderTopic = (template, device) => {
  const connectionConfig = parseJsonField(device.connection_config);
  const corp = device.manufacturer_code || '';
  const gatewayMac = connectionConfig.gatewayMac || connectionConfig.gateway_mac || device.imei;

  return template
    .replace(/\{corp\}/g, corp)
    .replace(/\{manufacturerCode\}/g, corp)
    .replace(/\{gatewayMac\}/g, gatewayMac)
    .replace(/\{imei\}/g, device.imei || '')
    .replace(/\{deviceId\}/g, device.device_code || device.imei || '');
};

const renderPayload = (payloadTemplate, values) => {
  if (Array.isArray(payloadTemplate)) {
    return payloadTemplate.map((item) => renderPayload(item, values));
  }

  if (payloadTemplate && typeof payloadTemplate === 'object') {
    return Object.entries(payloadTemplate).reduce((payload, [key, value]) => {
      payload[key] = renderPayload(value, values);
      return payload;
    }, {});
  }

  if (typeof payloadTemplate !== 'string') return payloadTemplate;

  const exactKey = payloadTemplate.match(/^\{(\w+)\}$/)?.[1];
  if (exactKey && Object.prototype.hasOwnProperty.call(values, exactKey)) {
    return values[exactKey];
  }

  return payloadTemplate.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};

const buildProtocolControlMessages = (device, controlData) => {
  const commandConfig = parseJsonField(device.command_config);
  const commands = Array.isArray(commandConfig.commands) ? commandConfig.commands : [];
  if (commands.length === 0) return [];

  const topicTemplate = commandConfig.topicTemplates?.control ||
    '{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB';
  const nextId = () => Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9));
  const buildMessage = (command, values) => ({
    topic: renderTopic(command.topic || topicTemplate, device),
    payload: renderPayload(command.payload || {}, values)
  });

  if (controlData.type === 'statistic') {
    const readCommand = commands.find((command) => command.name === 'read_status');
    return readCommand ? [buildMessage(readCommand, {
      id: nextId(),
      addr: controlData.addr || 1
    })] : [];
  }

  return ['key1', 'key2', 'key3']
    .map((key, index) => ({ key, addr: index + 1, value: controlData[key] }))
    .filter((item) => item.value !== undefined)
    .map((item) => {
      const commandName = Number(item.value) === 1 ? 'turn_on' : 'turn_off';
      const command = commands.find((candidate) => candidate.name === commandName);
      if (!command) return null;

      return buildMessage(command, {
        id: nextId(),
        addr: item.addr
      });
    })
    .filter(Boolean);
};

// 获取照明控制设备列表
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const deviceType = req.query.device_type || '照明开关';
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 24, 1), 200);
    const offset = (page - 1) * pageSize;
    const queryParams = [deviceType];
    let tenantClause = '';
    let filterClause = '';

    if (isAdminUser(req.user)) {
      if (req.query.tenantId) {
        queryParams.push(req.query.tenantId);
        tenantClause = ` AND lc.tenant_id = $${queryParams.length}`;
      }
    } else {
      queryParams.push(tenant_id);
      tenantClause = ` AND lc.tenant_id = $${queryParams.length}`;
    }

    if (req.query.keyword) {
      queryParams.push(`%${req.query.keyword}%`);
      filterClause += ` AND (d.name ILIKE $${queryParams.length} OR d.imei ILIKE $${queryParams.length} OR d.device_id ILIKE $${queryParams.length})`;
    }

    if (req.query.lighting_type) {
      queryParams.push(req.query.lighting_type);
      filterClause += ` AND lc.subtype = $${queryParams.length}`;
    }

    if (req.query.status) {
      queryParams.push(req.query.status);
      filterClause += ` AND d.status = $${queryParams.length}`;
    }

    if (req.query.buildingId) {
      queryParams.push(req.query.buildingId);
      filterClause += ` AND d.project_building_id = $${queryParams.length}`;
    }

    if (req.query.projectGroupId) {
      queryParams.push(req.query.projectGroupId);
      filterClause += ` AND d.project_group_id = $${queryParams.length}`;
    }

    const baseFrom = `
      FROM control_device_assignments lc
      JOIN devices d ON lc.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN tenants t ON lc.tenant_id = t.id
      LEFT JOIN project_buildings pb ON d.project_building_id = pb.id
      LEFT JOIN project_groups pg ON d.project_group_id = pg.id
      LEFT JOIN LATERAL (
        SELECT
          COALESCE((state->>'key1')::boolean, (state->>'switch_1')::boolean, false) AS switch_1,
          COALESCE((state->>'key2')::boolean, (state->>'switch_2')::boolean, false) AS switch_2,
          COALESCE((state->>'key3')::boolean, (state->>'switch_3')::boolean, false) AS switch_3,
          measured_at AS status_timestamp
        FROM lighting_latest_status
        WHERE device_id = d.id
      ) ls ON true
      WHERE lc.is_active = true
        AND lc.module_type = 'lighting'
        AND d.is_lighting = true
        AND COALESCE(d.device_category, 'standalone') <> 'gateway'
        AND dt.name = $1${tenantClause}${filterClause}
    `;

    const query = `
      SELECT 
        lc.id,
        lc.device_id,
        lc.tenant_id,
        lc.subtype AS lighting_type,
        NULL::text AS group_name,
        lc.display_order,
        lc.is_active,
        lc.created_at,
        lc.updated_at,
        d.name as device_name,
        d.imei as device_imei,
        d.status as device_status,
        d.location as device_location,
        d.description as device_description,
        d.manufacturer_code,
        d.project_building_id,
        d.project_group_id,
        dt.name as device_type_name,
        t.name as tenant_name,
        pb.name as project_building_name,
        pg.name as project_group_name,
        ls.switch_1,
        ls.switch_2,
        ls.switch_3,
        ls.status_timestamp
      ${baseFrom}
      ORDER BY lc.display_order ASC, lc.created_at ASC
      LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}
    `;
    const countQuery = `SELECT COUNT(*)::integer as total ${baseFrom}`;

    const [result, countResult] = await Promise.all([
      pool.query(query, [...queryParams, pageSize, offset]),
      pool.query(countQuery, queryParams)
    ]);
    const total = countResult.rows[0]?.total || 0;

    res.json({
      success: true,
      data: {
        devices: result.rows,
        total,
        pagination: {
          total,
          page,
          pageSize,
          totalPages: Math.ceil(total / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('获取照明控制设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取照明控制设备列表失败',
      error: error.message
    });
  }
});

// 添加设备到照明控制
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { tenant_id, id: user_id } = req.user;
    const { device_id, lighting_type, group_name, display_order } = req.body;
    const deviceType = req.body.device_type || '照明开关';
    const isAdmin = isAdminUser(req.user);

    // 验证必填字段
    if (!device_id || !lighting_type) {
      return res.status(400).json({
        success: false,
        message: '设备ID和照明类型为必填字段'
      });
    }

    // 验证照明类型
    const validLightingTypes = ['single', 'double', 'triple'];
    if (!validLightingTypes.includes(lighting_type)) {
      return res.status(400).json({
        success: false,
        message: '无效的照明类型，支持的类型：single, double, triple'
      });
    }

    // 检查设备是否存在且属于当前租户
    const deviceCheckParams = [device_id, deviceType];
    let deviceTenantClause = '';
    if (!isAdmin) {
      deviceCheckParams.push(tenant_id);
      deviceTenantClause = ` AND d.tenant_id = $${deviceCheckParams.length}`;
    }

    const deviceCheck = await pool.query(
      `SELECT d.id, d.name, d.tenant_id, d.device_category, dt.name as device_type_name
       FROM devices d
       LEFT JOIN device_types dt ON d.device_type_id = dt.id
       WHERE d.id = $1
         AND dt.name = $2
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'${deviceTenantClause}`,
      deviceCheckParams
    );

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `设备不存在、不属于当前租户或设备类型不是${deviceType}`
      });
    }

    const targetTenantId = deviceCheck.rows[0].tenant_id;

    // 检查设备是否已经添加到照明控制（包括已删除的记录）
    const existingCheck = await pool.query(
      `SELECT id, is_active FROM control_device_assignments
       WHERE device_id = $1 AND tenant_id = $2 AND module_type = 'lighting'`,
      [device_id, targetTenantId]
    );

    if (existingCheck.rows.length > 0) {
      const existingRecord = existingCheck.rows[0];
      if (existingRecord.is_active) {
        return res.status(409).json({
          success: false,
          message: '该设备已经添加到照明控制列表中'
        });
      } else {
        // 如果设备之前被删除，重新激活它
        const reactivateQuery = `
          UPDATE control_device_assignments
          SET is_active = true, 
              subtype = $1,
              display_order = $2,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = $3 AND module_type = 'lighting'
          RETURNING id, created_at
        `;

        const reactivateResult = await pool.query(reactivateQuery, [
          lighting_type,
          display_order || 0,
          existingRecord.id
        ]);
        await pool.query(
          'UPDATE devices SET is_lighting = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
          [device_id]
        );

        logger.info('照明控制设备重新激活成功', {
          lighting_control_id: existingRecord.id,
          device_id,
          lighting_type,
          user_id,
          tenant_id: targetTenantId
        });

        return res.status(201).json({
          success: true,
          message: '设备重新添加到照明控制成功',
          data: {
            id: existingRecord.id,
            device_id,
            lighting_type,
            group_name,
            display_order,
            created_at: reactivateResult.rows[0].created_at
          }
        });
      }
    }

    // 插入照明控制记录
    const insertQuery = `
      INSERT INTO control_device_assignments (tenant_id, device_id, module_type, subtype, display_order, created_by)
      VALUES ($1, $2, 'lighting', $3, $4, $5)
      RETURNING id, created_at
    `;

    const insertResult = await pool.query(insertQuery, [
      targetTenantId,
      device_id,
      lighting_type,
      display_order || 0,
      user_id
    ]);
    await pool.query(
      'UPDATE devices SET is_lighting = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [device_id]
    );

    logger.info('照明控制设备添加成功', {
      lighting_control_id: insertResult.rows[0].id,
      device_id,
      lighting_type,
      user_id,
      tenant_id: targetTenantId
    });

    res.status(201).json({
      success: true,
      message: '设备添加到照明控制成功',
      data: {
        id: insertResult.rows[0].id,
        device_id,
        lighting_type,
        group_name,
        display_order,
        created_at: insertResult.rows[0].created_at
      }
    });
  } catch (error) {
    logger.error('添加照明控制设备失败:', error);
    res.status(500).json({
      success: false,
      message: '添加照明控制设备失败',
      error: error.message
    });
  }
});

// 更新照明控制设备配置
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    const { lighting_type, group_name, display_order } = req.body;
    const existingParams = [id];
    let existingTenantClause = '';

    if (!isAdminUser(req.user)) {
      existingParams.push(tenant_id);
      existingTenantClause = ` AND tenant_id = $${existingParams.length}`;
    }

    // 检查记录是否存在且属于当前租户
    const existingCheck = await pool.query(
      `SELECT id FROM control_device_assignments
       WHERE id = $1${existingTenantClause} AND module_type = 'lighting' AND is_active = true`,
      existingParams
    );

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '照明控制记录不存在'
      });
    }

    // 验证照明类型（如果提供）
    if (lighting_type) {
      const validLightingTypes = ['single', 'double', 'triple'];
      if (!validLightingTypes.includes(lighting_type)) {
        return res.status(400).json({
          success: false,
          message: '无效的照明类型，支持的类型：single, double, triple'
        });
      }
    }

    // 构建更新字段
    const updateFields = [];
    const updateValues = [];
    let paramIndex = 1;

    if (lighting_type !== undefined) {
      updateFields.push(`subtype = $${paramIndex}`);
      updateValues.push(lighting_type);
      paramIndex++;
    }

    if (display_order !== undefined) {
      updateFields.push(`display_order = $${paramIndex}`);
      updateValues.push(display_order);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        message: '没有提供要更新的字段'
      });
    }

    // 添加WHERE条件参数
    updateValues.push(id);
    const idParamIndex = paramIndex;
    paramIndex++;

    let updateTenantClause = '';
    if (!isAdminUser(req.user)) {
      updateValues.push(tenant_id);
      updateTenantClause = ` AND tenant_id = $${paramIndex}`;
    }

    const updateQuery = `
      UPDATE control_device_assignments
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${idParamIndex}${updateTenantClause} AND module_type = 'lighting' AND is_active = true
      RETURNING *
    `;

    const updateResult = await pool.query(updateQuery, updateValues);

    logger.info('照明控制设备配置更新成功', {
      lighting_control_id: id,
      updates: { lighting_type, group_name, display_order },
      tenant_id
    });

    res.json({
      success: true,
      message: '照明控制设备配置更新成功',
      data: updateResult.rows[0]
    });
  } catch (error) {
    logger.error('更新照明控制设备配置失败:', error);
    res.status(500).json({
      success: false,
      message: '更新照明控制设备配置失败',
      error: error.message
    });
  }
});

// 从照明控制中移除设备（软删除）
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { id } = req.params;
    const existingParams = [id];
    let existingTenantClause = '';

    if (!isAdminUser(req.user)) {
      existingParams.push(tenant_id);
      existingTenantClause = ` AND tenant_id = $${existingParams.length}`;
    }

    // 检查记录是否存在且属于当前租户
    const existingCheck = await pool.query(
      `SELECT id, device_id FROM control_device_assignments
       WHERE id = $1${existingTenantClause} AND module_type = 'lighting' AND is_active = true`,
      existingParams
    );

    if (existingCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '照明控制记录不存在'
      });
    }

    // 软删除记录
    const deleteParams = [id];
    let deleteTenantClause = '';
    if (!isAdminUser(req.user)) {
      deleteParams.push(tenant_id);
      deleteTenantClause = ` AND tenant_id = $${deleteParams.length}`;
    }

    const deleteQuery = `
      UPDATE control_device_assignments
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1${deleteTenantClause} AND module_type = 'lighting'
      RETURNING id
    `;

    await pool.query(deleteQuery, deleteParams);
    await pool.query(
      'UPDATE devices SET is_lighting = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [existingCheck.rows[0].device_id]
    );

    logger.info('照明控制设备移除成功', {
      lighting_control_id: id,
      device_id: existingCheck.rows[0].device_id,
      tenant_id
    });

    res.json({
      success: true,
      message: '设备从照明控制中移除成功'
    });
  } catch (error) {
    logger.error('移除照明控制设备失败:', error);
    res.status(500).json({
      success: false,
      message: '移除照明控制设备失败',
      error: error.message
    });
  }
});

// 批量更新设备显示顺序
router.put('/batch/order', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { devices } = req.body; // [{ id, display_order }, ...]

    if (!Array.isArray(devices) || devices.length === 0) {
      return res.status(400).json({
        success: false,
        message: '请提供有效的设备列表'
      });
    }

    // 开始事务
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      for (const device of devices) {
        if (!device.id || device.display_order === undefined) {
          throw new Error('设备ID和显示顺序为必填字段');
        }

        const updateParams = [device.display_order, device.id];
        let tenantClause = '';
        if (!isAdminUser(req.user)) {
          updateParams.push(tenant_id);
          tenantClause = ` AND tenant_id = $${updateParams.length}`;
        }

        await client.query(
          `UPDATE control_device_assignments SET display_order = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2${tenantClause} AND module_type = 'lighting' AND is_active = true`,
          updateParams
        );
      }

      await client.query('COMMIT');

      logger.info('批量更新照明控制设备顺序成功', {
        device_count: devices.length,
        tenant_id
      });

      res.json({
        success: true,
        message: '设备显示顺序更新成功'
      });
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('批量更新照明控制设备顺序失败:', error);
    res.status(500).json({
      success: false,
      message: '批量更新设备顺序失败',
      error: error.message
    });
  }
});

// 获取可添加的设备列表（排除已添加的设备，默认显示照明开关，可按设备类型筛选）
router.get('/available-devices', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const deviceType = req.query.device_type || '照明开关';
    const queryParams = [deviceType];
    let tenantClause = '';

    if (isAdminUser(req.user)) {
      if (req.query.tenantId) {
        queryParams.push(req.query.tenantId);
        tenantClause = ` AND d.tenant_id = $${queryParams.length}`;
      }
    } else {
      queryParams.push(tenant_id);
      tenantClause = ` AND d.tenant_id = $${queryParams.length}`;
    }

    const query = `
      SELECT 
        d.id,
        d.name,
        d.imei,
        d.status,
        d.location,
        d.description,
        d.tenant_id,
        dt.name as device_type_name,
        t.name as tenant_name
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN tenants t ON d.tenant_id = t.id
      WHERE dt.name = $1${tenantClause}
        AND d.is_lighting = false
        AND COALESCE(d.device_category, 'standalone') <> 'gateway'
        AND NOT EXISTS (
          SELECT 1
          FROM control_device_assignments assignment
          WHERE assignment.device_id = d.id AND assignment.is_active = true
        )
      ORDER BY d.name ASC
    `;

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      data: {
        devices: result.rows,
        total: result.rows.length
      }
    });
  } catch (error) {
    logger.error('获取可添加设备列表失败:', error);
    res.status(500).json({
      success: false,
      message: '获取可添加设备列表失败',
      error: error.message
    });
  }
});

// 控制照明设备
router.post('/:deviceId/control', authenticateToken, async (req, res) => {
  try {
    const { tenant_id } = req.user;
    const { deviceId } = req.params;
    const requestBody = req.body;
    
    // 支持两种数据格式：
    // 1. 新格式：直接发送控制数据 {type: 'event', key1: 0, key3: 0}
    // 2. 旧格式：包装在command字段中 {command: {switch_1: 0, switch_3: 0}}
    let controlData;
    
    if (requestBody.command) {
      // 旧格式：转换控制命令格式
      const { command } = requestBody;
      controlData = {
        type: 'event'
      };
      
      // 映射开关命令：switch_1 -> key1, switch_2 -> key2, switch_3 -> key3
      if (command.switch_1 !== undefined) {
        controlData.key1 = command.switch_1;
      }
      if (command.switch_2 !== undefined) {
        controlData.key2 = command.switch_2;
      }
      if (command.switch_3 !== undefined) {
        controlData.key3 = command.switch_3;
      }
      
      // 处理重启命令
      if (command.restart !== undefined) {
        controlData.restart = command.restart;
      }
      
      // 处理统计命令
      if (command.statistic !== undefined) {
        controlData.type = 'statistic';
        delete controlData.restart; // 统计命令时移除restart字段
      }
    } else if (requestBody.type) {
      // 新格式：直接使用发送的控制数据
      controlData = { ...requestBody };
    } else {
      return res.status(400).json({
        success: false,
        message: '控制命令不能为空'
      });
    }
    
    // 验证控制数据是否有效
    const hasValidCommand = controlData.key1 !== undefined || 
                           controlData.key2 !== undefined || 
                           controlData.key3 !== undefined || 
                           controlData.restart !== undefined || 
                           controlData.type === 'statistic';
                           
    if (!hasValidCommand) {
      return res.status(400).json({
        success: false,
        message: '无效的控制命令格式'
      });
    }

    // 验证设备是否存在且属于用户可访问的照明控制列表
    const deviceCheckParams = [deviceId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      deviceCheckParams.push(tenant_id);
      tenantClause = ` AND lc.tenant_id = $${deviceCheckParams.length}`;
    }

    const deviceCheck = await pool.query(`
      SELECT
        d.id,
        lc.id AS assignment_id,
        lc.device_id,
        lc.tenant_id,
        d.device_id AS device_code,
        d.imei,
        d.name,
        d.manufacturer_code,
        d.connection_config,
        pc.command_config
      FROM control_device_assignments lc
      JOIN devices d ON lc.device_id = d.id
      LEFT JOIN protocol_configs pc ON d.protocol_config_id = pc.id
      WHERE (d.id::text = $1 OR d.imei = $1 OR d.device_id = $1)${tenantClause}
        AND lc.module_type = 'lighting'
        AND lc.is_active = true
    `, deviceCheckParams);

    if (deviceCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '设备不存在或不在照明控制列表中'
      });
    }

    const device = deviceCheck.rows[0];

    // 这里应该调用实际的设备控制服务
    // 目前先返回成功响应，实际项目中需要集成MQTT或其他设备通信协议
    logger.info('照明设备控制指令发送', {
      device_id: device.device_id,
      device_imei: device.imei,
      device_name: device.name,
      control_data: controlData,
      tenant_id
    });

    // 通过MQTT发送控制指令到设备。优先使用协议配置中的命令模板；
    // 未配置协议命令的设备继续走原有厂商/设备MQTT配置。
    let protocolMessages = [];
    try {
      protocolMessages = buildProtocolControlMessages(device, controlData);

      if (protocolMessages.length > 0) {
        for (const message of protocolMessages) {
          await mqttService.sendCommandToDevice(device.imei, message.payload, {
            mqttTopic: message.topic
          });
        }
      } else {
        await mqttService.sendCommandToDevice(device.imei, controlData);
      }

      logger.info('MQTT控制指令发送成功', {
        device_imei: device.imei,
        control_data: controlData,
        protocol_messages: protocolMessages
      });
    } catch (mqttError) {
      logger.error('MQTT控制指令发送失败', {
        device_imei: device.imei,
        control_data: controlData,
        error: mqttError.message
      });
      await telemetryStore.logControl({
        device,
        moduleType: 'lighting',
        action: controlData.type || 'lighting_control',
        command: controlData,
        encodedPayload: protocolMessages,
        status: 'failed',
        errorMessage: mqttError.message,
        userId: req.user.id
      });
      return res.status(502).json({ success: false, message: '照明设备MQTT控制指令发送失败', error: mqttError.message });
    }

    await telemetryStore.logControl({
      device,
      moduleType: 'lighting',
      action: controlData.type || 'lighting_control',
      command: controlData,
      encodedPayload: protocolMessages,
      status: 'sent',
      userId: req.user.id
    });

    res.json({
      success: true,
      message: '设备控制指令发送成功',
      data: {
        device_id: device.device_id,
        device_imei: device.imei,
        control_data: controlData
      }
    });
  } catch (error) {
    logger.error('控制照明设备失败:', error);
    res.status(500).json({
      success: false,
      message: '控制照明设备失败',
      error: error.message
    });
  }
});

module.exports = router;
