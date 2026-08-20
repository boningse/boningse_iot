const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');
const {
  PUSH_ENDPOINT, METRICS, SOURCE_TABLES, normalizeMetricFields, pushConfig
} = require('../services/electricalPushService');

const router = express.Router();
const pool = new Pool(getPoolConfig());
const manage = [authenticateToken, requireRole(['admin'])];
const isAdmin = (user) => user?.role === 'admin' || user?.role === 'super_admin';

function tenantWhere(req, params, alias = 'c') {
  if (isAdmin(req.user)) {
    if (req.query.tenantId) {
      params.push(req.query.tenantId);
      return ` AND ${alias}.tenant_id = $${params.length}`;
    }
    return '';
  }
  params.push(req.user.tenant_id);
  return ` AND ${alias}.tenant_id = $${params.length}`;
}

function cleanPayload(body) {
  return {
    deviceId: String(body.deviceId || '').trim(),
    projectCode: String(body.projectCode || '').trim(),
    externalDeviceCode: String(body.externalDeviceCode || '').trim(),
    insname: String(body.insname || '1001').trim(),
    propertyno: String(body.propertyno ?? '0').trim(),
    metricFields: normalizeMetricFields(body.metricFields),
    intervalMinutes: Math.round(Number(body.intervalMinutes || 5)),
    enabled: body.enabled !== false,
    dataSource: SOURCE_TABLES[body.dataSource] ? body.dataSource : 'switch'
  };
}

function validatePayload(data) {
  if (!data.deviceId || !data.projectCode || !data.externalDeviceCode || !data.insname) return '请完整填写设备和编码信息';
  if (!data.metricFields.length) return '请至少选择一个推送指标';
  if (data.intervalMinutes < 1 || data.intervalMinutes > 1440) return '推送周期应为1至1440分钟';
  if ([data.projectCode, data.externalDeviceCode, data.insname, data.propertyno].some((v) => v.length > 100)) return '编码长度不能超过100个字符';
  return '';
}

router.get('/options', ...manage, async (req, res) => {
  try {
    const dataSource = SOURCE_TABLES[req.query.dataSource] ? req.query.dataSource : 'switch';
    const sourceTable = SOURCE_TABLES[dataSource];
    const params = [];
    let scope = tenantWhere(req, params, 'd');
    if (req.query.keyword) {
      params.push(`%${req.query.keyword}%`);
      scope += ` AND (d.name ILIKE $${params.length} OR d.device_id ILIKE $${params.length} OR d.imei ILIKE $${params.length})`;
    }
    if (req.query.buildingId) {
      params.push(req.query.buildingId);
      scope += ` AND d.project_building_id = $${params.length}`;
    }
    if (req.query.groupId) {
      params.push(req.query.groupId);
      scope += ` AND d.project_group_id = $${params.length}`;
    }
    const result = await pool.query(
      `WITH electrical_devices AS (
         SELECT device_id, max(measured_at) measured_at
         FROM ${sourceTable} GROUP BY device_id
       )
       SELECT d.id, d.name, d.device_id, d.imei, d.status, d.tenant_id,
              d.project_building_id, d.project_group_id,
              t.name tenant_name, pb.name building_name, pg.name group_name,
              ed.measured_at latest_measurement_at,
              (c.id IS NOT NULL) configured
       FROM electrical_devices ed
       JOIN devices d ON d.id = ed.device_id
       LEFT JOIN tenants t ON t.id = d.tenant_id
       LEFT JOIN project_buildings pb ON pb.id = d.project_building_id
       LEFT JOIN project_groups pg ON pg.id = d.project_group_id
       LEFT JOIN electrical_push_configs c ON c.device_id = d.id
       WHERE 1=1${scope}
       ORDER BY t.name, pb.name, pg.name, d.name
       LIMIT 500`, params
    );
    res.json({ success: true, data: {
      endpoint: PUSH_ENDPOINT,
      dataSource,
      metrics: Object.entries(METRICS).map(([field, item]) => ({ field, ...item })),
      devices: result.rows
    } });
  } catch (error) {
    logger.error('读取电气数据推送选项失败', { error: error.message });
    res.status(500).json({ success: false, message: '读取可推送设备失败' });
  }
});

router.get('/logs', ...manage, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const params = [];
    let where = `WHERE 1=1${tenantWhere(req, params, 'l')}`;
    if (req.query.configId) {
      params.push(req.query.configId);
      where += ` AND l.config_id = $${params.length}`;
    }
    if (req.query.status) {
      params.push(req.query.status);
      where += ` AND l.status = $${params.length}`;
    }
    const count = await pool.query(`SELECT count(*)::int total FROM electrical_push_logs l ${where}`, params);
    params.push(pageSize, (page - 1) * pageSize);
    const list = await pool.query(
      `SELECT l.*, d.name device_name, d.device_id system_device_code,
              c.project_code, c.external_device_code
       FROM electrical_push_logs l
       LEFT JOIN devices d ON d.id=l.device_id
       LEFT JOIN electrical_push_configs c ON c.id=l.config_id
       ${where} ORDER BY l.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: { list: list.rows, total: count.rows[0].total, page, pageSize } });
  } catch (error) {
    logger.error('读取电气数据推送日志失败', { error: error.message });
    res.status(500).json({ success: false, message: '读取推送日志失败' });
  }
});

router.get('/', ...manage, async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 1), 100);
    const params = [];
    let where = `WHERE 1=1${tenantWhere(req, params, 'c')}`;
    if (req.query.keyword) {
      params.push(`%${req.query.keyword}%`);
      where += ` AND (d.name ILIKE $${params.length} OR d.device_id ILIKE $${params.length}
        OR c.project_code ILIKE $${params.length} OR c.external_device_code ILIKE $${params.length})`;
    }
    if (req.query.enabled === 'true' || req.query.enabled === 'false') {
      params.push(req.query.enabled === 'true');
      where += ` AND c.enabled = $${params.length}`;
    }
    if (SOURCE_TABLES[req.query.dataSource]) {
      params.push(req.query.dataSource);
      where += ` AND c.data_source = $${params.length}`;
    }
    const count = await pool.query(`SELECT count(*)::int total FROM electrical_push_configs c JOIN devices d ON d.id=c.device_id ${where}`, params);
    params.push(pageSize, (page - 1) * pageSize);
    const list = await pool.query(
      `SELECT c.*, d.name device_name, d.device_id system_device_code, d.imei, d.status device_status,
              t.name tenant_name, pb.name building_name, pg.name group_name
       FROM electrical_push_configs c
       JOIN devices d ON d.id=c.device_id
       LEFT JOIN tenants t ON t.id=c.tenant_id
       LEFT JOIN project_buildings pb ON pb.id=d.project_building_id
       LEFT JOIN project_groups pg ON pg.id=d.project_group_id
       ${where} ORDER BY c.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, data: { list: list.rows, total: count.rows[0].total, page, pageSize, endpoint: PUSH_ENDPOINT } });
  } catch (error) {
    logger.error('读取电气数据推送配置失败', { error: error.message });
    res.status(500).json({ success: false, message: '读取推送配置失败' });
  }
});

router.post('/', ...manage, async (req, res) => {
  try {
    const data = cleanPayload(req.body);
    const validation = validatePayload(data);
    if (validation) return res.status(400).json({ success: false, message: validation });
    const deviceParams = [data.deviceId];
    let deviceScope = '';
    if (!isAdmin(req.user)) {
      deviceParams.push(req.user.tenant_id);
      deviceScope = ` AND tenant_id=$2`;
    }
    const device = await pool.query(
      `SELECT d.id, d.tenant_id FROM devices d
       WHERE d.id=$1${deviceScope.replace('tenant_id', 'd.tenant_id')}
         AND EXISTS (
           SELECT 1 FROM (
             SELECT device_id FROM ${SOURCE_TABLES[data.dataSource]}
           ) electrical WHERE electrical.device_id=d.id
         )`, deviceParams
    );
    if (!device.rows[0]) return res.status(404).json({ success: false, message: '设备不存在、无电气数据或无权配置' });
    const result = await pool.query(
      `INSERT INTO electrical_push_configs
       (tenant_id, device_id, data_source, project_code, external_device_code, insname, propertyno,
        metric_fields, interval_minutes, enabled, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [device.rows[0].tenant_id, data.deviceId, data.dataSource, data.projectCode, data.externalDeviceCode,
        data.insname, data.propertyno, JSON.stringify(data.metricFields), data.intervalMinutes,
        data.enabled, req.user.id]
    );
    res.status(201).json({ success: true, message: '推送配置已创建', data: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ success: false, message: '该设备已经配置过推送' });
    logger.error('创建电气数据推送配置失败', { error: error.message });
    res.status(500).json({ success: false, message: '创建推送配置失败' });
  }
});

router.put('/:id', ...manage, async (req, res) => {
  try {
    const data = cleanPayload(req.body);
    const validation = validatePayload(data);
    if (validation) return res.status(400).json({ success: false, message: validation });
    const params = [req.params.id, data.projectCode, data.externalDeviceCode, data.insname,
      data.propertyno, JSON.stringify(data.metricFields), data.intervalMinutes, data.enabled,
      data.dataSource];
    const scope = tenantWhere(req, params, 'electrical_push_configs');
    const result = await pool.query(
      `UPDATE electrical_push_configs SET project_code=$2, external_device_code=$3,
       insname=$4, propertyno=$5, metric_fields=$6, interval_minutes=$7, enabled=$8,
       data_source=$9, updated_at=now() WHERE id=$1${scope} RETURNING *`, params
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: '推送配置不存在' });
    res.json({ success: true, message: '推送配置已更新', data: result.rows[0] });
  } catch (error) {
    logger.error('更新电气数据推送配置失败', { error: error.message });
    res.status(500).json({ success: false, message: '更新推送配置失败' });
  }
});

router.post('/:id/push', ...manage, async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = tenantWhere(req, params, 'c');
    const config = await pool.query(`SELECT c.* FROM electrical_push_configs c WHERE c.id=$1${scope}`, params);
    if (!config.rows[0]) return res.status(404).json({ success: false, message: '推送配置不存在' });
    const result = await pushConfig(config.rows[0], { force: true });
    res.json(result);
  } catch (error) {
    res.status(502).json({ success: false, message: error.message || '对方接口调用失败' });
  }
});

router.patch('/:id/enabled', ...manage, async (req, res) => {
  try {
    const params = [req.params.id, req.body.enabled === true];
    const scope = tenantWhere(req, params, 'electrical_push_configs');
    const result = await pool.query(
      `UPDATE electrical_push_configs SET enabled=$2, updated_at=now() WHERE id=$1${scope} RETURNING *`, params
    );
    if (!result.rows[0]) return res.status(404).json({ success: false, message: '推送配置不存在' });
    res.json({ success: true, message: result.rows[0].enabled ? '已启用自动推送' : '已暂停自动推送', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: '修改推送状态失败' });
  }
});

router.delete('/:id', ...manage, async (req, res) => {
  try {
    const params = [req.params.id];
    const scope = tenantWhere(req, params, 'electrical_push_configs');
    const result = await pool.query(`DELETE FROM electrical_push_configs WHERE id=$1${scope} RETURNING id`, params);
    if (!result.rows[0]) return res.status(404).json({ success: false, message: '推送配置不存在' });
    res.json({ success: true, message: '推送配置已删除' });
  } catch (error) {
    res.status(500).json({ success: false, message: '删除推送配置失败' });
  }
});

module.exports = router;
