const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');
const mqttService = require('../services/mqttService');
const telemetryStore = require('../services/telemetryStore');

const router = express.Router();
const pool = new Pool(getPoolConfig());

const SWITCH_DEVICE_TYPE = '定时开关';
const isAdminUser = (user) => user && (user.role === 'admin' || user.role === 'super_admin');
const toLegacyType = (phaseType) => phaseType === 'three_phase' ? 'triple' : 'single';
const toPhaseType = (legacyType) => legacyType === 'triple' ? 'three_phase' : (legacyType || 'single_phase');

const parseJsonField = (value) => {
  if (!value || typeof value === 'object') return value || {};
  try {
    return JSON.parse(value);
  } catch (_) {
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
  if (Array.isArray(payloadTemplate)) return payloadTemplate.map(item => renderPayload(item, values));
  if (payloadTemplate && typeof payloadTemplate === 'object') {
    return Object.entries(payloadTemplate).reduce((payload, [key, value]) => {
      payload[key] = renderPayload(value, values);
      return payload;
    }, {});
  }
  if (typeof payloadTemplate !== 'string') return payloadTemplate;
  const exactKey = payloadTemplate.match(/^\{(\w+)\}$/)?.[1];
  if (exactKey && Object.prototype.hasOwnProperty.call(values, exactKey)) return values[exactKey];
  return payloadTemplate.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
};

const buildProtocolControlMessages = (device, controlData) => {
  const commandConfig = parseJsonField(device.command_config);
  const commands = Array.isArray(commandConfig.commands) ? commandConfig.commands : [];
  if (commands.length === 0) return [];
  const topicTemplate = commandConfig.topicTemplates?.control || '{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB';
  const nextId = () => Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9));
  const buildMessage = (command, values) => ({
    topic: renderTopic(command.topic || topicTemplate, device),
    payload: renderPayload(command.payload || {}, values)
  });

  if (controlData.type === 'statistic') {
    const readCommand = commands.find(command => command.name === 'read_status');
    return readCommand ? [buildMessage(readCommand, { id: nextId(), addr: controlData.addr || 1 })] : [];
  }

  return ['key1', 'key2', 'key3']
    .map((key, index) => ({ key, addr: index + 1, value: controlData[key] }))
    .filter(item => item.value !== undefined)
    .map(item => {
      const commandName = Number(item.value) === 1 ? 'turn_on' : 'turn_off';
      const command = commands.find(candidate => candidate.name === commandName);
      return command ? buildMessage(command, { id: nextId(), addr: item.addr }) : null;
    })
    .filter(Boolean);
};

const normalizeControlData = (body) => {
  if (body.command) {
    const { command } = body;
    const data = { type: 'event' };
    if (command.switch_1 !== undefined) data.key1 = command.switch_1;
    if (command.switch_2 !== undefined) data.key2 = command.switch_2;
    if (command.switch_3 !== undefined) data.key3 = command.switch_3;
    if (command.restart !== undefined) data.restart = command.restart;
    if (command.statistic !== undefined) data.type = 'statistic';
    return data;
  }
  return body.type ? { ...body } : null;
};

const buildTenantClause = (req, alias, params) => {
  if (isAdminUser(req.user)) {
    if (req.query.tenantId) {
      params.push(req.query.tenantId);
      return ` AND ${alias}.tenant_id = $${params.length}`;
    }
    return '';
  }
  params.push(req.user.tenant_id);
  return ` AND ${alias}.tenant_id = $${params.length}`;
};

router.get('/', authenticateToken, async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 24, 1), 200);
    const offset = (page - 1) * pageSize;
    const params = [];
    let where = `WHERE sc.is_active = true
      AND sc.module_type = 'switch'
      AND d.is_switch = true
      AND COALESCE(d.device_category, 'standalone') <> 'gateway'`;
    where += buildTenantClause(req, 'sc', params);

    if (req.query.keyword) {
      params.push(`%${req.query.keyword}%`);
      where += ` AND (d.name ILIKE $${params.length} OR d.imei ILIKE $${params.length} OR d.device_id ILIKE $${params.length})`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND d.status = $${params.length}`;
    }
    if (req.query.buildingId) {
      params.push(req.query.buildingId);
      where += ` AND d.project_building_id = $${params.length}`;
    }
    if (req.query.projectGroupId) {
      params.push(req.query.projectGroupId);
      where += ` AND d.project_group_id = $${params.length}`;
    }

    const baseFrom = `
      FROM control_device_assignments sc
      JOIN devices d ON sc.device_id = d.id
      LEFT JOIN tenants t ON sc.tenant_id = t.id
      LEFT JOIN project_buildings pb ON d.project_building_id = pb.id
      LEFT JOIN project_groups pg ON d.project_group_id = pg.id
      LEFT JOIN LATERAL (
        SELECT
          switch_1,
          switch_2,
          switch_3,
          measured_at AS data_timestamp
        FROM switch_latest_status
        WHERE device_id = d.id
      ) ss ON true
      ${where}
    `;

    const query = `
      SELECT sc.id, sc.device_id, sc.subtype AS phase_type, NULL::text AS group_name, sc.display_order, sc.is_active,
             sc.tenant_id, sc.created_at, sc.updated_at,
             d.name as device_name, d.imei as device_imei, d.status as device_status,
             d.location as device_location, d.description as device_description, d.manufacturer_code,
             d.project_building_id, d.project_group_id,
             t.name as tenant_name, pb.name as project_building_name, pg.name as project_group_name,
             ss.switch_1, ss.switch_2, ss.switch_3, ss.data_timestamp as status_timestamp
      ${baseFrom}
      ORDER BY sc.display_order ASC, sc.created_at ASC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    const countQuery = `SELECT COUNT(*)::integer as total ${baseFrom}`;
    const [result, countResult] = await Promise.all([
      pool.query(query, [...params, pageSize, offset]),
      pool.query(countQuery, params)
    ]);
    const total = countResult.rows[0]?.total || 0;

    res.json({
      success: true,
      data: {
        devices: result.rows,
        total,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
      }
    });
  } catch (error) {
    logger.error('获取定时开关控制设备列表失败:', error);
    res.status(500).json({ success: false, message: '获取定时开关控制设备列表失败', error: error.message });
  }
});

router.get('/available-devices', authenticateToken, async (req, res) => {
  try {
    const params = [SWITCH_DEVICE_TYPE];
    let tenantClause = '';
    if (isAdminUser(req.user)) {
      if (req.query.tenantId) {
        params.push(req.query.tenantId);
        tenantClause = ` AND d.tenant_id = $${params.length}`;
      }
    } else {
      params.push(req.user.tenant_id);
      tenantClause = ` AND d.tenant_id = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT d.id, d.name, d.imei, d.status, d.location, d.description, d.tenant_id,
              dt.name as device_type_name, t.name as tenant_name
       FROM devices d
       LEFT JOIN device_types dt ON d.device_type_id = dt.id
       LEFT JOIN tenants t ON d.tenant_id = t.id
       WHERE dt.name = $1${tenantClause}
         AND d.is_switch = false
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'
         AND NOT EXISTS (
           SELECT 1 FROM control_device_assignments assignment
           WHERE assignment.device_id = d.id AND assignment.is_active = true
         )
       ORDER BY d.name ASC`,
      params
    );
    res.json({ success: true, data: { devices: result.rows, total: result.rows.length } });
  } catch (error) {
    logger.error('获取可添加定时开关设备失败:', error);
    res.status(500).json({ success: false, message: '获取可添加定时开关设备失败', error: error.message });
  }
});

router.get('/:imei/status', authenticateToken, async (req, res) => {
  try {
    const params = [req.params.imei];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND d.tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT
         s.switch_1,
         s.switch_2,
         s.switch_3,
         s.measured_at AS data_timestamp
       FROM switch_latest_status s
       JOIN devices d ON d.id = s.device_id
       WHERE d.imei = $1${tenantClause}
       LIMIT 1`,
      params
    );
    const row = result.rows[0];
    res.json({
      success: true,
      data: row ? {
        switchStates: { key1: row.switch_1, key2: row.switch_2, key3: row.switch_3 },
        timestamp: row.data_timestamp
      } : null
    });
  } catch (error) {
    logger.error('获取定时开关状态失败:', error);
    res.status(500).json({ success: false, message: '获取定时开关状态失败', error: error.message });
  }
});

router.post('/', authenticateToken, async (req, res) => {
  try {
    const { device_id, phase_type, lighting_type, group_name, display_order } = req.body;
    if (!device_id) return res.status(400).json({ success: false, message: '设备ID为必填字段' });
    const phaseType = phase_type || toPhaseType(lighting_type);
    const params = [device_id, SWITCH_DEVICE_TYPE];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND d.tenant_id = $${params.length}`;
    }
    const deviceCheck = await pool.query(
      `SELECT d.id, d.tenant_id, d.device_category
       FROM devices d
       LEFT JOIN device_types dt ON d.device_type_id = dt.id
       WHERE d.id = $1
         AND dt.name = $2
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}`,
      params
    );
    if (deviceCheck.rows.length === 0) return res.status(404).json({ success: false, message: '设备不存在或不是定时开关' });
    const targetTenantId = deviceCheck.rows[0].tenant_id;

    const result = await pool.query(
      `INSERT INTO control_device_assignments (tenant_id, device_id, module_type, subtype, display_order, created_by, is_active)
       VALUES ($1, $2, 'switch', $3, $4, $5, true)
       ON CONFLICT (device_id, module_type) DO UPDATE
       SET is_active = true, tenant_id = EXCLUDED.tenant_id, subtype = EXCLUDED.subtype,
           display_order = EXCLUDED.display_order, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [targetTenantId, device_id, phaseType, display_order || 0, req.user.id]
    );
    await pool.query(
      'UPDATE devices SET is_switch = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [device_id]
    );
    res.status(201).json({ success: true, message: '定时开关设备添加成功', data: result.rows[0] });
  } catch (error) {
    logger.error('添加定时开关设备失败:', error);
    res.status(500).json({ success: false, message: '添加定时开关设备失败', error: error.message });
  }
});

router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const fields = [];
    const values = [];
    let index = 1;
    if (req.body.phase_type !== undefined || req.body.lighting_type !== undefined) {
      fields.push(`subtype = $${index++}`);
      values.push(req.body.phase_type || toPhaseType(req.body.lighting_type));
    }
    if (req.body.display_order !== undefined) {
      fields.push(`display_order = $${index++}`);
      values.push(req.body.display_order);
    }
    if (fields.length === 0) return res.status(400).json({ success: false, message: '没有提供要更新的字段' });

    values.push(req.params.id);
    let where = `WHERE id = $${index++} AND module_type = 'switch' AND is_active = true`;
    if (!isAdminUser(req.user)) {
      values.push(req.user.tenant_id);
      where += ` AND tenant_id = $${index}`;
    }
    const result = await pool.query(
      `UPDATE control_device_assignments SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP ${where} RETURNING *`,
      values
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '定时开关控制记录不存在' });
    res.json({ success: true, message: '定时开关配置更新成功', data: result.rows[0] });
  } catch (error) {
    logger.error('更新定时开关配置失败:', error);
    res.status(500).json({ success: false, message: '更新定时开关配置失败', error: error.message });
  }
});

router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const params = [req.params.id];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE control_device_assignments SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND module_type = 'switch'${tenantClause} RETURNING id, device_id`,
      params
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, message: '定时开关控制记录不存在' });
    await pool.query(
      'UPDATE devices SET is_switch = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [result.rows[0].device_id]
    );
    res.json({ success: true, message: '定时开关已移除' });
  } catch (error) {
    logger.error('移除定时开关失败:', error);
    res.status(500).json({ success: false, message: '移除定时开关失败', error: error.message });
  }
});

router.post('/:deviceId/control', authenticateToken, async (req, res) => {
  try {
    const controlData = normalizeControlData(req.body);
    if (!controlData) return res.status(400).json({ success: false, message: '控制命令不能为空' });
    const hasValidCommand = controlData.key1 !== undefined || controlData.key2 !== undefined ||
      controlData.key3 !== undefined || controlData.restart !== undefined || controlData.type === 'statistic';
    if (!hasValidCommand) return res.status(400).json({ success: false, message: '无效的控制命令格式' });

    const params = [req.params.deviceId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND sc.tenant_id = $${params.length}`;
    }
    const deviceCheck = await pool.query(
      `SELECT sc.id as switch_control_id, sc.device_id, sc.tenant_id, d.device_id AS device_code,
              d.imei, d.name, d.manufacturer_code, d.connection_config, pc.command_config
       FROM control_device_assignments sc
       JOIN devices d ON sc.device_id = d.id
       LEFT JOIN protocol_configs pc ON d.protocol_config_id = pc.id
       WHERE d.imei = $1${tenantClause}
         AND sc.module_type = 'switch'
         AND sc.is_active = true
         AND d.is_switch = true
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'`,
      params
    );
    if (deviceCheck.rows.length === 0) return res.status(404).json({ success: false, message: '设备不存在或不在定时开关控制列表中' });
    const device = deviceCheck.rows[0];

    let protocolMessages = [];
    try {
      protocolMessages = buildProtocolControlMessages(device, controlData);
      if (protocolMessages.length > 0) {
        for (const message of protocolMessages) {
          await mqttService.sendCommandToDevice(device.imei, message.payload, { mqttTopic: message.topic });
        }
      } else {
        await mqttService.sendCommandToDevice(device.imei, controlData);
      }
    } catch (mqttError) {
      logger.error('定时开关MQTT控制指令发送失败', { imei: device.imei, error: mqttError.message });
      await telemetryStore.logControl({
        device,
        moduleType: 'switch',
        action: controlData.type || 'switch_control',
        command: controlData,
        encodedPayload: protocolMessages,
        status: 'failed',
        errorMessage: mqttError.message,
        userId: req.user.id
      });
      return res.status(502).json({ success: false, message: '定时开关MQTT控制指令发送失败', error: mqttError.message });
    }

    await telemetryStore.logControl({
      device,
      moduleType: 'switch',
      action: controlData.type || 'switch_control',
      command: controlData,
      encodedPayload: protocolMessages,
      status: 'sent',
      userId: req.user.id
    });

    res.json({
      success: true,
      message: '定时开关控制指令发送成功',
      data: { device_id: device.device_id, device_imei: device.imei, control_data: controlData }
    });
  } catch (error) {
    logger.error('控制定时开关失败:', error);
    res.status(500).json({ success: false, message: '控制定时开关失败', error: error.message });
  }
});

module.exports = router;
