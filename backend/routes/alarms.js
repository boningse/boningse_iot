const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');

const router = express.Router();
const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.ALARM_API_DB_POOL_MAX, 10) || 5,
  min: 0
});

const ROLES = ['admin', 'tenant_admin', 'user', 'building_user', 'group_user'];
const MODULE_TYPES = ['switch', 'lighting', 'thermostat', 'air_conditioner'];
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const STATUSES = ['active', 'acknowledged', 'processing', 'resolved', 'closed'];
const ACTION_CONFIG = {
  acknowledge: {
    action: 'acknowledged',
    allowed: ['active'],
    toStatus: 'acknowledged'
  },
  assign: {
    action: 'assigned',
    allowed: ['active', 'acknowledged', 'processing'],
    toStatus: 'processing',
    requireAssignee: true
  },
  process: {
    action: 'processing',
    allowed: ['active', 'acknowledged', 'processing'],
    toStatus: 'processing'
  },
  comment: {
    action: 'commented',
    allowed: STATUSES,
    toStatus: null,
    requireNote: true
  },
  resolve: {
    action: 'resolved',
    allowed: ['active', 'acknowledged', 'processing'],
    toStatus: 'resolved',
    requireNote: true
  },
  close: {
    action: 'closed',
    allowed: ['resolved'],
    toStatus: 'closed'
  },
  reopen: {
    action: 'reopened',
    allowed: ['resolved', 'closed'],
    toStatus: 'active',
    requireNote: true
  }
};

const reject = (res, status, message) => res.status(status).json({ success: false, message });

const profileValue = (user, key) => {
  const profile = user?.profile || {};
  return profile[key] || null;
};

const addScope = (req, params, conditions, deviceAlias = 'd', alarmAlias = 'a') => {
  if (req.user.role === 'admin') {
    if (req.query.tenantId) {
      params.push(req.query.tenantId);
      conditions.push(`${alarmAlias}.tenant_id = $${params.length}`);
    }
  } else {
    params.push(req.user.tenant_id);
    conditions.push(`${alarmAlias}.tenant_id = $${params.length}`);
  }

  if (req.user.role === 'building_user') {
    const buildingId = profileValue(req.user, 'project_building_id') || profileValue(req.user, 'building_id');
    if (buildingId) {
      params.push(buildingId);
      conditions.push(`${deviceAlias}.project_building_id = $${params.length}`);
    }
  }

  if (req.user.role === 'group_user') {
    const groupId = profileValue(req.user, 'project_group_id') || profileValue(req.user, 'group_id');
    if (groupId) {
      params.push(groupId);
      conditions.push(`${deviceAlias}.project_group_id = $${params.length}`);
    }
  }
};

const buildAlarmQuery = (req, { includeFilters = true } = {}) => {
  const params = [];
  const conditions = [];
  addScope(req, params, conditions);

  if (includeFilters) {
    const {
      keyword,
      moduleType,
      severity,
      status,
      alarmType,
      buildingId,
      groupId,
      startAt,
      endAt
    } = req.query;

    if (keyword) {
      params.push(`%${keyword}%`);
      conditions.push(`(
        d.name ILIKE $${params.length}
        OR d.imei ILIKE $${params.length}
        OR a.title ILIKE $${params.length}
        OR COALESCE(a.message, '') ILIKE $${params.length}
        OR COALESCE(a.alarm_code, '') ILIKE $${params.length}
      )`);
    }
    if (moduleType && MODULE_TYPES.includes(moduleType)) {
      params.push(moduleType);
      conditions.push(`a.module_type = $${params.length}`);
    }
    if (severity && SEVERITIES.includes(severity)) {
      params.push(severity);
      conditions.push(`a.severity = $${params.length}`);
    }
    if (status === 'open') {
      conditions.push(`a.status IN ('active', 'acknowledged', 'processing')`);
    } else if (status && STATUSES.includes(status)) {
      params.push(status);
      conditions.push(`a.status = $${params.length}`);
    }
    if (alarmType) {
      params.push(alarmType);
      conditions.push(`a.alarm_type = $${params.length}`);
    }
    if (buildingId) {
      params.push(buildingId);
      conditions.push(`d.project_building_id = $${params.length}`);
    }
    if (groupId) {
      params.push(groupId);
      conditions.push(`d.project_group_id = $${params.length}`);
    }
    if (startAt) {
      params.push(startAt);
      conditions.push(`a.last_occurred_at >= $${params.length}::timestamptz`);
    }
    if (endAt) {
      params.push(endAt);
      conditions.push(`a.last_occurred_at <= $${params.length}::timestamptz`);
    }
  }

  return {
    params,
    where: conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  };
};

const joins = `
  FROM device_alarms a
  JOIN devices d ON d.id = a.device_id
  LEFT JOIN device_types dt ON dt.id = d.device_type_id
  LEFT JOIN tenants t ON t.id = a.tenant_id
  LEFT JOIN project_buildings pb ON pb.id = d.project_building_id
  LEFT JOIN project_groups pg ON pg.id = d.project_group_id
  LEFT JOIN users assignee ON assignee.id = a.assigned_to
`;

router.get('/summary', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const { params, where } = buildAlarmQuery(req, { includeFilters: true });
    const totals = await pool.query(
      `SELECT
         count(*)::integer AS total,
         count(*) FILTER (WHERE a.status = 'active')::integer AS active,
         count(*) FILTER (WHERE a.status = 'acknowledged')::integer AS acknowledged,
         count(*) FILTER (WHERE a.status = 'processing')::integer AS processing,
         count(*) FILTER (WHERE a.status = 'resolved')::integer AS resolved,
         count(*) FILTER (WHERE a.status = 'closed')::integer AS closed,
         count(*) FILTER (WHERE a.severity = 'critical' AND a.status IN ('active', 'acknowledged', 'processing'))::integer AS critical,
         count(*) FILTER (WHERE a.severity = 'high' AND a.status IN ('active', 'acknowledged', 'processing'))::integer AS high
       ${joins}
       ${where}`,
      params
    );

    const moduleDistribution = await pool.query(
      `SELECT a.module_type, count(*)::integer AS count
       ${joins}
       ${where}
         ${where ? 'AND' : 'WHERE'} a.status IN ('active', 'acknowledged', 'processing')
       GROUP BY a.module_type`,
      params
    );

    const severityDistribution = await pool.query(
      `SELECT a.severity, count(*)::integer AS count
       ${joins}
       ${where}
         ${where ? 'AND' : 'WHERE'} a.status IN ('active', 'acknowledged', 'processing')
       GROUP BY a.severity`,
      params
    );

    const trendParams = [...params];
    trendParams.push(7);
    const trend = await pool.query(
      `SELECT to_char(day, 'MM-DD') AS day,
              count(a.id)::integer AS count
       FROM generate_series(
         date_trunc('day', now()) - (($${trendParams.length}::integer - 1) * interval '1 day'),
         date_trunc('day', now()),
         interval '1 day'
       ) day
       LEFT JOIN (
         SELECT a.*
         ${joins}
         ${where}
       ) a ON a.first_occurred_at >= day AND a.first_occurred_at < day + interval '1 day'
       GROUP BY day
       ORDER BY day`,
      trendParams
    );

    res.json({
      success: true,
      data: {
        totals: totals.rows[0],
        modules: moduleDistribution.rows,
        severities: severityDistribution.rows,
        trend: trend.rows
      }
    });
  } catch (error) {
    logger.error('获取告警概览失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取告警概览失败', error: error.message });
  }
});

router.get('/options', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const params = [];
    const conditions = [`u.status = 'active'`];
    if (req.user.role !== 'admin') {
      params.push(req.user.tenant_id);
      conditions.push(`u.tenant_id = $${params.length}`);
    } else if (req.query.tenantId) {
      params.push(req.query.tenantId);
      conditions.push(`u.tenant_id = $${params.length}`);
    }
    const users = await pool.query(
      `SELECT u.id, u.username, u.role, u.tenant_id
       FROM users u
       WHERE ${conditions.join(' AND ')}
       ORDER BY u.username`,
      params
    );
    res.json({ success: true, data: { users: users.rows } });
  } catch (error) {
    logger.error('获取告警处理人选项失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取处理人失败', error: error.message });
  }
});

router.get('/', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 20, 1), 100);
    const { params, where } = buildAlarmQuery(req, { includeFilters: true });
    const countResult = await pool.query(`SELECT count(*)::integer AS total ${joins} ${where}`, params);

    const listParams = [...params, pageSize, (page - 1) * pageSize];
    const rows = await pool.query(
      `SELECT a.*,
              d.name AS device_name, d.imei, d.status AS device_status,
              d.project_building_id, d.project_group_id,
              dt.name AS device_type_name,
              t.name AS tenant_name,
              pb.name AS building_name,
              pg.name AS group_name,
              assignee.username AS assigned_to_name
       ${joins}
       ${where}
       ORDER BY
         CASE a.status WHEN 'active' THEN 1 WHEN 'acknowledged' THEN 2 WHEN 'processing' THEN 3 WHEN 'resolved' THEN 4 ELSE 5 END,
         CASE a.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         a.last_occurred_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    );

    res.json({
      success: true,
      data: {
        list: rows.rows,
        pagination: {
          total: countResult.rows[0].total,
          page,
          pageSize,
          totalPages: Math.ceil(countResult.rows[0].total / pageSize)
        }
      }
    });
  } catch (error) {
    logger.error('获取告警列表失败', { error: error.message });
    res.status(500).json({ success: false, message: '获取告警列表失败', error: error.message });
  }
});

const getScopedAlarm = async (req, alarmId, client = pool) => {
  const params = [alarmId];
  const conditions = ['a.id = $1'];
  addScope(req, params, conditions);
  const result = await client.query(
    `SELECT a.*, d.name AS device_name, d.imei, d.status AS device_status,
            dt.name AS device_type_name, t.name AS tenant_name,
            pb.name AS building_name, pg.name AS group_name,
            assignee.username AS assigned_to_name
     ${joins}
     WHERE ${conditions.join(' AND ')}`,
    params
  );
  return result.rows[0] || null;
};

router.get('/:id', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const alarm = await getScopedAlarm(req, req.params.id);
    if (!alarm) return reject(res, 404, '告警不存在或无权访问');
    const actions = await pool.query(
      `SELECT aa.*, u.username AS operator_username, assigned.username AS assigned_to_name
       FROM device_alarm_actions aa
       LEFT JOIN users u ON u.id = aa.operator_id
       LEFT JOIN users assigned ON assigned.id = aa.assigned_to
       WHERE aa.alarm_id = $1
       ORDER BY aa.created_at DESC`,
      [alarm.id]
    );
    res.json({ success: true, data: { alarm, actions: actions.rows } });
  } catch (error) {
    logger.error('获取告警详情失败', { alarmId: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: '获取告警详情失败', error: error.message });
  }
});

const performAction = async (client, req, alarm, actionName, payload = {}) => {
  const config = ACTION_CONFIG[actionName];
  if (!config) throw new Error('不支持的处理动作');
  if (!config.allowed.includes(alarm.status)) {
    throw new Error(`当前状态不允许执行${actionName}操作`);
  }
  const note = String(payload.note || '').trim();
  const assignedTo = payload.assignedTo || payload.assigned_to || null;
  if (config.requireNote && !note) throw new Error('请填写处理说明');
  if (config.requireAssignee && !assignedTo) throw new Error('请选择处理人');

  if (assignedTo) {
    const assignee = await client.query(
      `SELECT id FROM users WHERE id = $1 AND status = 'active' AND ($2::uuid IS NULL OR tenant_id = $2)`,
      [assignedTo, alarm.tenant_id]
    );
    if (assignee.rowCount === 0) throw new Error('处理人不属于当前租户或已停用');
  }

  const nextStatus = config.toStatus || alarm.status;
  const updates = ['status = $2', 'updated_at = now()'];
  const values = [alarm.id, nextStatus];
  const set = (sql, value) => {
    values.push(value);
    updates.push(`${sql} = $${values.length}`);
  };

  if (actionName === 'acknowledge') {
    set('acknowledged_by', req.user.id);
    updates.push('acknowledged_at = now()');
  }
  if (actionName === 'assign') {
    set('assigned_to', assignedTo);
    if (note) set('processing_note', note);
  }
  if (actionName === 'process' && note) set('processing_note', note);
  if (actionName === 'resolve') {
    set('resolved_by', req.user.id);
    set('resolution', note);
    updates.push('resolved_at = now()');
  }
  if (actionName === 'close') {
    set('closed_by', req.user.id);
    updates.push('closed_at = now()');
  }
  if (actionName === 'reopen') {
    updates.push(
      'resolved_by = NULL', 'resolved_at = NULL', 'resolution = NULL',
      'closed_by = NULL', 'closed_at = NULL'
    );
  }

  const updated = await client.query(
    `UPDATE device_alarms SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values
  );
  await client.query(
    `INSERT INTO device_alarm_actions (
       alarm_id, tenant_id, action, from_status, to_status,
       operator_id, operator_name, assigned_to, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      alarm.id,
      alarm.tenant_id,
      config.action,
      alarm.status,
      nextStatus,
      req.user.id,
      req.user.username,
      assignedTo,
      note || null
    ]
  );
  return updated.rows[0];
};

router.post('/batch-actions', authenticateToken, requireRole(ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    const alarmIds = Array.isArray(req.body.alarmIds) ? [...new Set(req.body.alarmIds)] : [];
    const { action, ...payload } = req.body;
    if (alarmIds.length === 0 || alarmIds.length > 100) return reject(res, 400, '请选择 1-100 条告警');
    await client.query('BEGIN');
    const results = [];
    for (const alarmId of alarmIds) {
      const alarm = await getScopedAlarm(req, alarmId, client);
      if (!alarm) throw new Error('包含不存在或无权访问的告警');
      results.push(await performAction(client, req, alarm, action, payload));
    }
    await client.query('COMMIT');
    res.json({ success: true, message: `已处理 ${results.length} 条告警`, data: results });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('批量处理告警失败', { error: error.message });
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

router.post('/:id/actions', authenticateToken, requireRole(ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alarm = await getScopedAlarm(req, req.params.id, client);
    if (!alarm) {
      await client.query('ROLLBACK');
      return reject(res, 404, '告警不存在或无权访问');
    }
    const updated = await performAction(client, req, alarm, req.body.action, req.body);
    await client.query('COMMIT');
    res.json({ success: true, message: '告警处理成功', data: updated });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('处理告警失败', { alarmId: req.params.id, error: error.message });
    res.status(400).json({ success: false, message: error.message });
  } finally {
    client.release();
  }
});

module.exports = router;
