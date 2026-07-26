const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getPoolConfig } = require('../config/database');
const {
  insertPhotoRecords,
  normalizeClientType,
  removeFiles,
  resolveStoragePath,
  uploadAlarmPhotos
} = require('../services/alarmPhotoService');
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
const STATUSES = ['active', 'acknowledged', 'assigned', 'processing', 'resolved', 'closed'];
const MANAGER_ROLES = ['admin', 'tenant_admin'];
const DISPATCH_ROLES = ['admin', 'tenant_admin', 'building_user', 'group_user'];
const ACTION_CONFIG = {
  acknowledge: {
    action: 'acknowledged',
    allowed: ['active'],
    toStatus: 'acknowledged'
  },
  assign: {
    action: 'assigned',
    allowed: ['active', 'acknowledged', 'processing'],
    toStatus: 'assigned',
    requireAssignee: true
  },
  accept: {
    action: 'accepted',
    allowed: ['assigned'],
    toStatus: 'processing',
    assigneeOnly: true
  },
  reject: {
    action: 'rejected',
    allowed: ['assigned'],
    toStatus: 'acknowledged',
    assigneeOnly: true,
    requireNote: true
  },
  process: {
    action: 'processing',
    allowed: ['processing'],
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
    allowed: ['processing'],
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
const getClientType = (req, payload = {}) => normalizeClientType(
  req.get('X-Client-Type') || payload.clientType || payload.client_type || 'pc'
);

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
      conditions.push(`a.status IN ('active', 'acknowledged', 'assigned', 'processing')`);
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
    if (req.query.mine === 'true') {
      params.push(req.user.id);
      conditions.push(`a.assigned_to = $${params.length}`);
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
         count(*) FILTER (WHERE a.status = 'assigned')::integer AS assigned,
         count(*) FILTER (WHERE a.status = 'processing')::integer AS processing,
         count(*) FILTER (WHERE a.status = 'resolved')::integer AS resolved,
         count(*) FILTER (WHERE a.status = 'closed')::integer AS closed,
         count(*) FILTER (WHERE a.severity = 'critical' AND a.status IN ('active', 'acknowledged', 'assigned', 'processing'))::integer AS critical,
         count(*) FILTER (WHERE a.severity = 'high' AND a.status IN ('active', 'acknowledged', 'assigned', 'processing'))::integer AS high
       ${joins}
       ${where}`,
      params
    );

    const moduleDistribution = await pool.query(
      `SELECT a.module_type, count(*)::integer AS count
       ${joins}
       ${where}
         ${where ? 'AND' : 'WHERE'} a.status IN ('active', 'acknowledged', 'assigned', 'processing')
       GROUP BY a.module_type`,
      params
    );

    const severityDistribution = await pool.query(
      `SELECT a.severity, count(*)::integer AS count
       ${joins}
       ${where}
         ${where ? 'AND' : 'WHERE'} a.status IN ('active', 'acknowledged', 'assigned', 'processing')
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
    const conditions = [
      `u.status = 'active'`,
      `(u.role IN ('admin', 'tenant_admin') OR COALESCE(u.profile->'permissions', '[]'::jsonb) ? 'alarms')`
    ];
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
         CASE a.status WHEN 'active' THEN 1 WHEN 'acknowledged' THEN 2 WHEN 'assigned' THEN 3 WHEN 'processing' THEN 4 WHEN 'resolved' THEN 5 ELSE 6 END,
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

router.get('/notifications/unread-count', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT count(*)::integer AS count
       FROM user_alarm_notifications
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ success: true, data: { count: result.rows[0].count } });
  } catch (error) {
    logger.error('获取告警未读消息数量失败', { userId: req.user.id, error: error.message });
    res.status(500).json({ success: false, message: '获取未读消息数量失败' });
  }
});

router.get('/notifications', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const unreadCondition = req.query.unreadOnly === 'true' ? 'AND n.is_read = false' : '';
    const result = await pool.query(
      `SELECT n.*, a.severity, a.status AS alarm_status, d.name AS device_name
       FROM user_alarm_notifications n
       JOIN device_alarms a ON a.id = n.alarm_id
       JOIN devices d ON d.id = a.device_id
       WHERE n.user_id = $1 ${unreadCondition}
       ORDER BY n.created_at DESC
       LIMIT $2`,
      [req.user.id, limit]
    );
    res.json({ success: true, data: { list: result.rows } });
  } catch (error) {
    logger.error('获取告警站内消息失败', { userId: req.user.id, error: error.message });
    res.status(500).json({ success: false, message: '获取告警消息失败' });
  }
});

router.post('/notifications/read-all', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    await pool.query(
      `UPDATE user_alarm_notifications
       SET is_read = true, read_at = COALESCE(read_at, now())
       WHERE user_id = $1 AND is_read = false`,
      [req.user.id]
    );
    res.json({ success: true, message: '告警消息已全部标记为已读' });
  } catch (error) {
    logger.error('标记全部告警消息已读失败', { userId: req.user.id, error: error.message });
    res.status(500).json({ success: false, message: '更新消息状态失败' });
  }
});

router.post('/notifications/:id/read', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE user_alarm_notifications
       SET is_read = true, read_at = COALESCE(read_at, now())
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return reject(res, 404, '消息不存在');
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    logger.error('标记告警消息已读失败', { notificationId: req.params.id, error: error.message });
    res.status(500).json({ success: false, message: '更新消息状态失败' });
  }
});

router.get('/:id/photos/:photoId/content', authenticateToken, requireRole(ROLES), async (req, res) => {
  try {
    const alarm = await getScopedAlarm(req, req.params.id);
    if (!alarm) return reject(res, 404, '告警不存在或无权访问');
    const result = await pool.query(
      `SELECT id, original_name, storage_path, mime_type
       FROM device_alarm_photos
       WHERE id = $1 AND alarm_id = $2`,
      [req.params.photoId, alarm.id]
    );
    if (result.rowCount === 0) return reject(res, 404, '照片不存在');
    const photo = result.rows[0];
    res.set({
      'Content-Type': photo.mime_type,
      'Content-Disposition': `inline; filename="alarm-photo-${photo.id}"`,
      'Cache-Control': 'private, max-age=300'
    });
    res.sendFile(resolveStoragePath(photo.storage_path), (error) => {
      if (error && !res.headersSent) {
        res.status(error.code === 'ENOENT' ? 404 : 500).json({
          success: false,
          message: error.code === 'ENOENT' ? '照片文件不存在' : '读取照片失败'
        });
      }
    });
  } catch (error) {
    logger.error('读取工单照片失败', { photoId: req.params.photoId, error: error.message });
    res.status(500).json({ success: false, message: '读取照片失败' });
  }
});

router.delete('/:id/photos/:photoId', authenticateToken, requireRole(ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alarm = await getScopedAlarm(req, req.params.id, client);
    if (!alarm) {
      await client.query('ROLLBACK');
      return reject(res, 404, '告警不存在或无权访问');
    }
    const result = await client.query(
      `SELECT * FROM device_alarm_photos WHERE id = $1 AND alarm_id = $2 FOR UPDATE`,
      [req.params.photoId, alarm.id]
    );
    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return reject(res, 404, '照片不存在');
    }
    const photo = result.rows[0];
    if (
      String(photo.uploaded_by || '') !== String(req.user.id)
      && !MANAGER_ROLES.includes(req.user.role)
    ) {
      await client.query('ROLLBACK');
      return reject(res, 403, '只能删除本人上传的照片');
    }
    await client.query('DELETE FROM device_alarm_photos WHERE id = $1', [photo.id]);
    await client.query('COMMIT');
    try {
      await removeFiles([photo]);
    } catch (cleanupError) {
      logger.error('工单照片记录已删除，但文件清理失败', {
        photoId: photo.id,
        error: cleanupError.message
      });
    }
    res.json({ success: true, message: '照片已删除' });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('删除工单照片失败', { photoId: req.params.photoId, error: error.message });
    res.status(500).json({ success: false, message: '删除照片失败' });
  } finally {
    client.release();
  }
});

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
    const photos = await pool.query(
      `SELECT p.id, p.alarm_id, p.action_id, p.original_name, p.mime_type,
              p.file_size, p.category, p.client_type, p.captured_at,
              p.latitude, p.longitude, p.location_text, p.created_at,
              u.username AS uploaded_by_name
       FROM device_alarm_photos p
       LEFT JOIN users u ON u.id = p.uploaded_by
       WHERE p.alarm_id = $1
       ORDER BY p.created_at ASC`,
      [alarm.id]
    );
    const photoRows = photos.rows.map((photo) => ({
      ...photo,
      content_url: `/api/alarms/${alarm.id}/photos/${photo.id}/content`
    }));
    const actionRows = actions.rows.map((action) => ({
      ...action,
      photos: photoRows.filter((photo) => String(photo.action_id || '') === String(action.id))
    }));
    res.json({ success: true, data: { alarm, actions: actionRows, photos: photoRows } });
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
  const clientType = getClientType(req, payload);
  const uploadedPhotoCount = Number(payload._uploadedPhotoCount || 0);
  if (config.requireNote && !note) throw new Error('请填写处理说明');
  if (config.requireAssignee && !assignedTo) throw new Error('请选择处理人');
  if (
    clientType === 'mini_program'
    && ['process', 'resolve'].includes(actionName)
    && uploadedPhotoCount < 1
  ) {
    throw new Error('微信小程序处理工单时必须上传至少一张现场照片');
  }
  if (actionName === 'assign' && !DISPATCH_ROLES.includes(req.user.role)) {
    throw new Error('当前用户无派单权限');
  }
  if (config.assigneeOnly && String(alarm.assigned_to || '') !== String(req.user.id)) {
    throw new Error('只有当前处理人可以接单或退回');
  }
  if (
    ['process', 'resolve'].includes(actionName)
    && alarm.assigned_to
    && String(alarm.assigned_to) !== String(req.user.id)
    && !MANAGER_ROLES.includes(req.user.role)
  ) {
    throw new Error('该工单已分配给其他处理人');
  }

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
    updates.push('assigned_at = now()', 'accepted_by = NULL', 'accepted_at = NULL');
    if (note) set('processing_note', note);
  }
  if (actionName === 'accept') {
    set('accepted_by', req.user.id);
    updates.push('accepted_at = now()');
  }
  if (actionName === 'reject') {
    updates.push(
      'assigned_to = NULL', 'assigned_at = NULL',
      'accepted_by = NULL', 'accepted_at = NULL'
    );
    set('processing_note', note);
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
  const actionResult = await client.query(
    `INSERT INTO device_alarm_actions (
       alarm_id, tenant_id, action, from_status, to_status,
       operator_id, operator_name, assigned_to, note
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id`,
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

  if (actionName === 'assign') {
    const notificationType = alarm.assigned_to ? 'reassignment' : 'assignment';
    await client.query(
      `UPDATE user_alarm_notifications
       SET is_read = true, read_at = COALESCE(read_at, now())
       WHERE alarm_id = $1 AND is_read = false`,
      [alarm.id]
    );
    await client.query(
      `INSERT INTO user_alarm_notifications (
         tenant_id, user_id, alarm_id, notification_type, title, message, link
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        alarm.tenant_id,
        assignedTo,
        alarm.id,
        notificationType,
        `${alarm.severity === 'critical' ? '紧急' : '告警'}工单待接单：${alarm.device_name}`,
        note || alarm.message || alarm.title,
        `/alarms?alarmId=${alarm.id}&mine=true`
      ]
    );
  }
  if (['accept', 'reject'].includes(actionName)) {
    await client.query(
      `UPDATE user_alarm_notifications
       SET is_read = true, read_at = COALESCE(read_at, now())
       WHERE alarm_id = $1 AND user_id = $2 AND is_read = false`,
      [alarm.id, req.user.id]
    );
  }

  return {
    ...updated.rows[0],
    workflow_action_id: actionResult.rows[0].id
  };
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
      results.push(await performAction(client, req, alarm, action, {
        ...payload,
        _uploadedPhotoCount: 0
      }));
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

router.post(
  '/:id/actions-with-photos',
  authenticateToken,
  requireRole(ROLES),
  uploadAlarmPhotos,
  async (req, res) => {
    const client = await pool.connect();
    const files = req.files || [];
    try {
      await client.query('BEGIN');
      const alarm = await getScopedAlarm(req, req.params.id, client);
      if (!alarm) throw new Error('告警不存在或无权访问');
      const action = String(req.body.action || '').trim();
      const updated = await performAction(client, req, alarm, action, {
        ...req.body,
        _uploadedPhotoCount: files.length
      });
      const photos = await insertPhotoRecords({
        client,
        files,
        alarm,
        actionId: updated.workflow_action_id,
        userId: req.user.id,
        action,
        clientType: getClientType(req, req.body),
        category: req.body.category,
        capturedAt: req.body.capturedAt || req.body.captured_at,
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        locationText: req.body.locationText || req.body.location_text
      });
      if (photos.length > 0) {
        await client.query(
          `UPDATE device_alarm_actions
           SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
           WHERE id = $1`,
          [updated.workflow_action_id, JSON.stringify({ photo_count: photos.length })]
        );
      }
      await client.query('COMMIT');
      res.json({
        success: true,
        message: photos.length ? `告警处理成功，已上传 ${photos.length} 张照片` : '告警处理成功',
        data: { alarm: updated, photos }
      });
    } catch (error) {
      await client.query('ROLLBACK');
      try {
        await removeFiles(files);
      } catch (cleanupError) {
        logger.error('回滚工单照片文件失败', { error: cleanupError.message });
      }
      logger.error('带照片处理告警失败', { alarmId: req.params.id, error: error.message });
      res.status(error.message.includes('不存在') ? 404 : 400).json({
        success: false,
        message: error.message
      });
    } finally {
      client.release();
    }
  }
);

router.post('/:id/actions', authenticateToken, requireRole(ROLES), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const alarm = await getScopedAlarm(req, req.params.id, client);
    if (!alarm) {
      await client.query('ROLLBACK');
      return reject(res, 404, '告警不存在或无权访问');
    }
    const updated = await performAction(client, req, alarm, req.body.action, {
      ...req.body,
      _uploadedPhotoCount: 0
    });
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
