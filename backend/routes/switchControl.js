const express = require('express');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');
const telemetryStore = require('../services/telemetryStore');
const { executeSwitchControl } = require('../services/switchControlExecutor');

const router = express.Router();
const pool = new Pool(getPoolConfig());

const SWITCH_DEVICE_TYPE = '定时开关';
const SWITCH_ELECTRICAL_FIELDS = telemetryStore.MODULE_CONFIG.switch.electricalFields
  .filter((item) => item.type === 'number')
  .map((item) => item.name);
const isAdminUser = (user) => user && (user.role === 'admin' || user.role === 'super_admin');
const toLegacyType = (phaseType) => phaseType === 'three_phase' ? 'triple' : 'single';
const toPhaseType = (legacyType) => legacyType === 'triple' ? 'three_phase' : (legacyType || 'single_phase');

const normalizeControlData = (body) => {
  if (body.command) {
    const { command } = body;
    const data = { type: 'event' };
    if (command.power_status !== undefined) data.power_status = normalizePowerStatus(command.power_status);
    if (command.restart !== undefined) data.restart = command.restart;
    if (command.statistic !== undefined) data.type = 'statistic';
    return data;
  }
  if (body.power_status !== undefined) {
    return { type: body.type || 'event', power_status: normalizePowerStatus(body.power_status) };
  }
  return body.type ? { ...body } : null;
};

const numberOrNull = (value) => value === null || value === undefined ? null : Number(value);

const normalizeElectricalRow = (row = {}) => {
  const normalized = {
    id: row.id,
    device_id: row.device_id,
    tenant_id: row.tenant_id,
    manufacturer_code: row.manufacturer_code,
    imei: row.imei,
    phase_type: row.phase_type || 'single_phase',
    extra_metrics: row.extra_metrics || {},
    channel_measurements: row.channel_measurements || null,
    raw_payload: row.raw_payload || {},
    timestamp: row.measured_at,
    created_at: row.created_at
  };
  SWITCH_ELECTRICAL_FIELDS.forEach((field) => {
    normalized[field] = numberOrNull(row[field]);
  });
  return normalized;
};

const normalizePowerStatus = (value) => {
  if (typeof value === 'string') return ['1', 'true', 'on', 'open'].includes(value.toLowerCase());
  return value === true || value === 1;
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

const getAssignedSwitchDevice = async (req, identifier) => {
  const params = [identifier];
  let tenantClause = '';
  if (!isAdminUser(req.user)) {
    params.push(req.user.tenant_id);
    tenantClause = ` AND d.tenant_id = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT d.id, d.name, d.imei, d.device_id, d.manufacturer_code, d.tenant_id,
            assignment.subtype AS phase_type
     FROM devices d
     JOIN control_device_assignments assignment
       ON assignment.device_id = d.id
      AND assignment.module_type = 'switch'
      AND assignment.is_active = true
     WHERE (d.imei = $1 OR d.device_id = $1 OR d.id::text = $1)${tenantClause}
     LIMIT 1`,
    params
  );
  return result.rows[0] || null;
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
          power_status,
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
             ss.power_status, ss.data_timestamp as status_timestamp
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

const normalizeStrategyPayload = (body = {}) => ({
  name: String(body.name || '').trim(),
  deviceIds: [...new Set(Array.isArray(body.deviceIds) ? body.deviceIds.filter(Boolean) : [])],
  action: body.action,
  executeTime: body.executeTime || body.time,
  repeatType: body.repeatType || 'once',
  weekDays: [...new Set(Array.isArray(body.weekDays) ? body.weekDays : body.repeat || [])]
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  customDates: [...new Set(Array.isArray(body.customDates) ? body.customDates.filter(Boolean) : [])],
  enabled: body.enabled !== false,
  description: String(body.description || '').trim().slice(0, 200)
});

const validateStrategyPayload = (strategy) => {
  if (!strategy.name || strategy.name.length > 100) return '请输入有效的策略名称';
  if (!strategy.deviceIds.length) return '请选择至少一台开关设备';
  if (!['on', 'off'].includes(strategy.action)) return '请选择有效的开关动作';
  if (!/^\d{2}:\d{2}$/.test(String(strategy.executeTime || ''))) return '请选择执行时间';
  if (!['once', 'daily', 'weekly', 'custom'].includes(strategy.repeatType)) return '请选择有效的重复方式';
  if (strategy.repeatType === 'weekly' && !strategy.weekDays.length) return '请选择每周执行日期';
  if (strategy.repeatType === 'custom' && !strategy.customDates.length) return '请选择自定义执行日期';
  return null;
};

const findStrategyDevices = async (client, req, deviceIds) => {
  const params = [deviceIds];
  let tenantClause = '';
  if (!isAdminUser(req.user)) {
    params.push(req.user.tenant_id);
    tenantClause = ` AND assignment.tenant_id = $${params.length}`;
  }
  const result = await client.query(
    `SELECT DISTINCT assignment.device_id, assignment.tenant_id
     FROM control_device_assignments assignment
     JOIN devices d ON d.id = assignment.device_id
     WHERE assignment.device_id = ANY($1::uuid[])
       AND assignment.module_type = 'switch'
       AND assignment.is_active = true
       AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}`,
    params
  );
  return result.rows;
};

const saveStrategyRows = async (client, req, groupId, strategy, devices) => {
  for (const device of devices) {
    await client.query(
      `INSERT INTO switch_control_schedules (
         group_id, tenant_id, device_id, name, action, execute_time,
         repeat_type, repeat_days, custom_dates, enabled, description, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        groupId, device.tenant_id, device.device_id, strategy.name,
        strategy.action, strategy.executeTime, strategy.repeatType,
        strategy.repeatType === 'weekly' ? strategy.weekDays : [],
        strategy.repeatType === 'custom' ? strategy.customDates : [],
        strategy.enabled, strategy.description || null, req.user.id
      ]
    );
  }
};

router.get('/strategy-devices', authenticateToken, async (req, res) => {
  try {
    const params = [];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND assignment.tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT DISTINCT d.id, d.name, d.device_id, d.imei, d.status,
              d.tenant_id, d.project_building_id, d.project_group_id,
              t.name AS tenant_name, pb.name AS project_building_name,
              pg.name AS project_group_name
       FROM control_device_assignments assignment
       JOIN devices d ON d.id = assignment.device_id
       LEFT JOIN tenants t ON t.id = d.tenant_id
       LEFT JOIN project_buildings pb ON pb.id = d.project_building_id
       LEFT JOIN project_groups pg ON pg.id = d.project_group_id
       WHERE assignment.module_type = 'switch'
         AND assignment.is_active = true
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}
       ORDER BY t.name NULLS LAST, d.name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('获取开关策略设备失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取开关策略设备失败', error: error.message });
  }
});

router.get('/strategies', authenticateToken, async (req, res) => {
  try {
    const params = [];
    let where = `WHERE assignment.module_type = 'switch' AND assignment.is_active = true`;
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      where += ` AND schedule.tenant_id = $${params.length}`;
    } else if (req.query.tenantId) {
      params.push(req.query.tenantId);
      where += ` AND schedule.tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT schedule.*, d.name AS device_name, d.imei AS device_imei,
              d.device_id AS device_code, t.name AS tenant_name
       FROM switch_control_schedules schedule
       JOIN devices d ON d.id = schedule.device_id
       JOIN control_device_assignments assignment ON assignment.device_id = d.id
       LEFT JOIN tenants t ON t.id = schedule.tenant_id
       ${where}
       ORDER BY schedule.created_at DESC, d.name`,
      params
    );
    const groups = new Map();
    for (const row of result.rows) {
      const groupId = row.group_id || row.id;
      if (!groups.has(groupId)) {
        groups.set(groupId, {
          id: groupId,
          name: row.name,
          action: row.action,
          executeTime: String(row.execute_time || '').slice(0, 5),
          repeatType: row.repeat_type || 'once',
          weekDays: (row.repeat_days || []).map(Number),
          customDates: row.custom_dates || [],
          enabled: row.enabled !== false,
          description: row.description || '',
          tenantId: row.tenant_id,
          tenantName: row.tenant_name,
          devices: []
        });
      }
      const group = groups.get(groupId);
      group.enabled = group.enabled && row.enabled !== false;
      group.devices.push({
        id: row.device_id,
        name: row.device_name,
        deviceId: row.device_code,
        imei: row.device_imei
      });
    }
    res.json({ success: true, data: [...groups.values()] });
  } catch (error) {
    logger.error('获取开关控制策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取开关控制策略失败', error: error.message });
  }
});

router.post('/strategies', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const strategy = normalizeStrategyPayload(req.body);
    const validationError = validateStrategyPayload(strategy);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    await client.query('BEGIN');
    const devices = await findStrategyDevices(client, req, strategy.deviceIds);
    if (devices.length !== strategy.deviceIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '部分设备不存在或不属于开关控制模块' });
    }
    if (new Set(devices.map((device) => String(device.tenant_id))).size !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '同一策略只能选择同一租户的设备' });
    }
    const groupId = randomUUID();
    await saveStrategyRows(client, req, groupId, strategy, devices);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: '开关控制策略已创建', data: { id: groupId } });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('创建开关控制策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建开关控制策略失败', error: error.message });
  } finally {
    client.release();
  }
});

router.put('/strategies/:groupId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const strategy = normalizeStrategyPayload(req.body);
    const validationError = validateStrategyPayload(strategy);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    await client.query('BEGIN');
    const params = [req.params.groupId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const existing = await client.query(
      `SELECT id FROM switch_control_schedules WHERE group_id = $1${tenantClause}`,
      params
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: '开关控制策略不存在或无权限' });
    }
    const devices = await findStrategyDevices(client, req, strategy.deviceIds);
    if (devices.length !== strategy.deviceIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '部分设备不存在或无权限' });
    }
    if (new Set(devices.map((device) => String(device.tenant_id))).size !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '同一策略只能选择同一租户的设备' });
    }
    await client.query('DELETE FROM switch_control_schedules WHERE group_id = $1', [req.params.groupId]);
    await saveStrategyRows(client, req, req.params.groupId, strategy, devices);
    await client.query('COMMIT');
    res.json({ success: true, message: '开关控制策略已更新' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('更新开关控制策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新开关控制策略失败', error: error.message });
  } finally {
    client.release();
  }
});

router.put('/strategies/:groupId/toggle', authenticateToken, async (req, res) => {
  try {
    const params = [req.body.enabled === true, req.params.groupId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE switch_control_schedules
       SET enabled = $1, updated_at = CURRENT_TIMESTAMP
       WHERE group_id = $2${tenantClause}`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: '开关控制策略不存在' });
    }
    res.json({ success: true, message: req.body.enabled === true ? '策略已启用' : '策略已停用' });
  } catch (error) {
    logger.error('更新开关控制策略状态失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新开关控制策略状态失败', error: error.message });
  }
});

router.delete('/strategies/:groupId', authenticateToken, async (req, res) => {
  try {
    const params = [req.params.groupId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `DELETE FROM switch_control_schedules WHERE group_id = $1${tenantClause}`,
      params
    );
    if (!result.rowCount) {
      return res.status(404).json({ success: false, message: '开关控制策略不存在' });
    }
    res.json({ success: true, message: '开关控制策略已删除' });
  } catch (error) {
    logger.error('删除开关控制策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除开关控制策略失败', error: error.message });
  }
});

router.get('/:identifier/electrical/latest', authenticateToken, async (req, res) => {
  try {
    const device = await getAssignedSwitchDevice(req, req.params.identifier);
    if (!device) return res.status(404).json({ success: false, message: '开关设备不存在或无权访问' });
    const params = [device.id];
    let manufacturerClause = '';
    if (req.query.manufacturer_code) {
      params.push(req.query.manufacturer_code);
      manufacturerClause = ` AND manufacturer_code = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT * FROM switch_latest_electrical
       WHERE device_id = $1${manufacturerClause}`,
      params
    );
    res.json({
      success: true,
      data: {
        device,
        electrical: result.rows[0] ? normalizeElectricalRow(result.rows[0]) : null,
        source: result.rows[0] ? 'switch_electrical_measurements' : 'no_data'
      },
      message: result.rows[0] ? undefined : '暂无开关电气数据'
    });
  } catch (error) {
    logger.error('获取开关最新电气数据失败:', error);
    res.status(500).json({ success: false, message: '获取开关最新电气数据失败', error: error.message });
  }
});

router.get('/:identifier/electrical/history', authenticateToken, async (req, res) => {
  try {
    const device = await getAssignedSwitchDevice(req, req.params.identifier);
    if (!device) return res.status(404).json({ success: false, message: '开关设备不存在或无权访问' });
    const params = [device.id];
    let where = 'WHERE device_id = $1';
    if (req.query.manufacturer_code) {
      params.push(req.query.manufacturer_code);
      where += ` AND manufacturer_code = $${params.length}`;
    }
    if (req.query.start_time) {
      params.push(new Date(req.query.start_time));
      where += ` AND measured_at >= $${params.length}`;
    }
    if (req.query.end_time) {
      params.push(new Date(req.query.end_time));
      where += ` AND measured_at <= $${params.length}`;
    }
    params.push(Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const result = await pool.query(
      `SELECT * FROM switch_electrical_measurements ${where}
       ORDER BY measured_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: {
        device,
        list: result.rows.map(normalizeElectricalRow),
        total: result.rows.length,
        source: 'switch_electrical_measurements'
      }
    });
  } catch (error) {
    logger.error('获取开关电气历史失败:', error);
    res.status(500).json({ success: false, message: '获取开关电气历史失败', error: error.message });
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
         s.power_status,
         s.measured_at AS data_timestamp
       FROM switch_latest_status s
       JOIN devices d ON d.id = s.device_id
       WHERE (d.imei = $1 OR d.device_id = $1 OR d.id::text = $1)${tenantClause}
       LIMIT 1`,
      params
    );
    const row = result.rows[0];
    res.json({
      success: true,
      data: row ? {
        power_status: row.power_status,
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
    const hasValidCommand = controlData.power_status !== undefined ||
      controlData.restart !== undefined || controlData.type === 'statistic';
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
       WHERE (d.imei = $1 OR d.device_id = $1 OR d.id::text = $1)${tenantClause}
         AND sc.module_type = 'switch'
         AND sc.is_active = true
         AND d.is_switch = true
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'`,
      params
    );
    if (deviceCheck.rows.length === 0) return res.status(404).json({ success: false, message: '设备不存在或不在定时开关控制列表中' });
    const device = deviceCheck.rows[0];

    try {
      await executeSwitchControl(device, controlData, req.user.id);
    } catch (mqttError) {
      logger.error('定时开关MQTT控制指令发送失败', { imei: device.imei, error: mqttError.message });
      return res.status(502).json({ success: false, message: '定时开关MQTT控制指令发送失败', error: mqttError.message });
    }

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
