const express = require('express');
const { randomUUID } = require('crypto');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');

const router = express.Router();
const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.TIMER_ROUTE_DB_POOL_MAX, 10) || 5,
  min: 0
});

const isAdminUser = (user) =>
  user && (user.role === 'admin' || user.role === 'super_admin');

const normalizePayload = (body = {}) => ({
  name: String(body.name || '').trim(),
  deviceIds: [...new Set(Array.isArray(body.deviceIds) ? body.deviceIds.filter(Boolean) : [])],
  action: body.action,
  executeTime: body.executeTime || body.time,
  repeatType: body.repeatType || 'once',
  weekDays: [...new Set(Array.isArray(body.weekDays) ? body.weekDays : [])]
    .map(Number)
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6),
  customDates: [...new Set(Array.isArray(body.customDates) ? body.customDates.filter(Boolean) : [])],
  enabled: body.enabled !== false,
  description: String(body.description || '').trim().slice(0, 200)
});

const validatePayload = (strategy) => {
  if (!strategy.name || strategy.name.length > 100) return '请输入有效的策略名称';
  if (!strategy.deviceIds.length) return '请选择至少一台照明设备';
  if (!['on', 'off'].includes(strategy.action)) return '请选择有效的照明动作';
  if (!/^\d{2}:\d{2}$/.test(String(strategy.executeTime || ''))) return '请选择执行时间';
  if (!['once', 'daily', 'weekly', 'custom'].includes(strategy.repeatType)) return '请选择有效的重复方式';
  if (strategy.repeatType === 'weekly' && !strategy.weekDays.length) return '请选择每周执行日期';
  if (strategy.repeatType === 'custom' && !strategy.customDates.length) return '请选择自定义执行日期';
  return null;
};

const findDevices = async (client, req, deviceIds) => {
  const params = [deviceIds];
  let tenantClause = '';
  if (!isAdminUser(req.user)) {
    params.push(req.user.tenant_id);
    tenantClause = ` AND assignment.tenant_id = $${params.length}`;
  }
  const result = await client.query(
    `SELECT DISTINCT d.id, assignment.tenant_id
     FROM control_device_assignments assignment
     JOIN devices d ON d.id = assignment.device_id
     WHERE d.id = ANY($1::uuid[])
       AND assignment.module_type = 'lighting'
       AND assignment.is_active = true
       AND d.is_lighting = true
       AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}`,
    params
  );
  return result.rows;
};

const saveRows = async (client, req, groupId, strategy, devices) => {
  for (const device of devices) {
    await client.query(
      `INSERT INTO lighting_device_timers (
         group_id, tenant_id, device_id, name, action, time,
         repeat_type, repeat_days, custom_dates, repeat,
         enabled, description, created_by
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [
        groupId, device.tenant_id, String(device.id), strategy.name,
        strategy.action, strategy.executeTime, strategy.repeatType,
        strategy.repeatType === 'weekly' ? strategy.weekDays : [],
        strategy.repeatType === 'custom' ? strategy.customDates : [],
        strategy.repeatType === 'weekly' ? strategy.weekDays.map(String) : [],
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
              assignment.subtype AS lighting_type,
              tenant.name AS tenant_name,
              building.name AS project_building_name,
              project_group.name AS project_group_name
       FROM control_device_assignments assignment
       JOIN devices d ON d.id = assignment.device_id
       LEFT JOIN tenants tenant ON tenant.id = d.tenant_id
       LEFT JOIN project_buildings building ON building.id = d.project_building_id
       LEFT JOIN project_groups project_group ON project_group.id = d.project_group_id
       WHERE assignment.module_type = 'lighting'
         AND assignment.is_active = true
         AND d.is_lighting = true
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}
       ORDER BY tenant.name NULLS LAST, d.name`,
      params
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    logger.error('获取照明策略设备失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取照明策略设备失败', error: error.message });
  }
});

router.get('/strategies', authenticateToken, async (req, res) => {
  try {
    const params = [];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND timer.tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `SELECT timer.*, d.name AS device_name, d.device_id AS device_code,
              d.imei, tenant.name AS tenant_name
       FROM lighting_device_timers timer
       JOIN devices d ON d.id::text = timer.device_id
       LEFT JOIN tenants tenant ON tenant.id = timer.tenant_id
       WHERE 1 = 1${tenantClause}
       ORDER BY timer.created_at DESC, d.name`,
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
          executeTime: String(row.time || '').slice(0, 5),
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
        imei: row.imei
      });
    }
    res.json({ success: true, data: [...groups.values()] });
  } catch (error) {
    logger.error('获取照明策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取照明策略失败', error: error.message });
  }
});

router.post('/strategies', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const strategy = normalizePayload(req.body);
    const validationError = validatePayload(strategy);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    await client.query('BEGIN');
    const devices = await findDevices(client, req, strategy.deviceIds);
    if (devices.length !== strategy.deviceIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '部分设备不存在或不属于照明控制模块' });
    }
    if (new Set(devices.map((device) => String(device.tenant_id))).size !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '同一策略只能选择同一租户的设备' });
    }
    const groupId = randomUUID();
    await saveRows(client, req, groupId, strategy, devices);
    await client.query('COMMIT');
    res.status(201).json({ success: true, message: '照明策略已创建', data: { id: groupId } });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('创建照明策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建照明策略失败', error: error.message });
  } finally {
    client.release();
  }
});

router.put('/strategies/:groupId', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const strategy = normalizePayload(req.body);
    const validationError = validatePayload(strategy);
    if (validationError) return res.status(400).json({ success: false, message: validationError });
    await client.query('BEGIN');
    const params = [req.params.groupId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const existing = await client.query(
      `SELECT id FROM lighting_device_timers WHERE group_id = $1${tenantClause}`,
      params
    );
    if (!existing.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: '照明策略不存在或无权限' });
    }
    const devices = await findDevices(client, req, strategy.deviceIds);
    if (devices.length !== strategy.deviceIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '部分设备不存在或无权限' });
    }
    if (new Set(devices.map((device) => String(device.tenant_id))).size !== 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: '同一策略只能选择同一租户的设备' });
    }
    await client.query('DELETE FROM lighting_device_timers WHERE group_id = $1', [req.params.groupId]);
    await saveRows(client, req, req.params.groupId, strategy, devices);
    await client.query('COMMIT');
    res.json({ success: true, message: '照明策略已更新' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('更新照明策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新照明策略失败', error: error.message });
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
      `UPDATE lighting_device_timers
       SET enabled = $1, updated_at = CURRENT_TIMESTAMP
       WHERE group_id = $2${tenantClause}`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: '照明策略不存在或无权限' });
    res.json({ success: true, message: req.body.enabled === true ? '策略已启用' : '策略已停用' });
  } catch (error) {
    logger.error('切换照明策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '切换照明策略失败', error: error.message });
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
      `DELETE FROM lighting_device_timers WHERE group_id = $1${tenantClause}`,
      params
    );
    if (!result.rowCount) return res.status(404).json({ success: false, message: '照明策略不存在或无权限' });
    res.json({ success: true, message: '照明策略已删除' });
  } catch (error) {
    logger.error('删除照明策略失败', { error: error.message });
    res.status(500).json({ success: false, message: '删除照明策略失败', error: error.message });
  }
});

module.exports = router;
