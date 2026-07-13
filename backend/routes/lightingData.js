const express = require('express');
const { Pool } = require('pg');
const { authenticateToken, requirePermission } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');
const telemetryStore = require('../services/telemetryStore');

const router = express.Router();
const pool = new Pool(getPoolConfig());

const ELECTRICAL_FIELDS = [...new Set(
  ['switch', 'lighting'].flatMap((moduleType) =>
    telemetryStore.MODULE_CONFIG[moduleType].electricalFields
      .filter((item) => item.type === 'number')
      .map((item) => item.name)
  )
)];

const isAdminUser = (user) => user && (user.role === 'admin' || user.role === 'super_admin');
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
  ELECTRICAL_FIELDS.forEach((field) => {
    normalized[field] = numberOrNull(row[field]);
  });
  return normalized;
};

const getDevice = async (req, identifier, moduleType) => {
  const params = [identifier, moduleType];
  let tenantClause = '';
  if (!isAdminUser(req.user)) {
    params.push(req.user.tenant_id);
    tenantClause = ` AND d.tenant_id = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT d.id, d.name, d.imei, d.device_id, d.manufacturer_code, d.tenant_id,
            assignment.subtype
     FROM devices d
     JOIN control_device_assignments assignment
       ON assignment.device_id = d.id
      AND assignment.module_type = $2
      AND assignment.is_active = true
     WHERE (d.imei = $1 OR d.device_id = $1 OR d.id::text = $1)${tenantClause}
     LIMIT 1`,
    params
  );
  return result.rows[0] || null;
};

const saveLightingItem = async (req, item, source = 'manual_import') => {
  const device = await getDevice(req, item.device_imei, 'lighting');
  if (!device) throw new Error('设备不存在或无权访问');
  if (item.manufacturer_code && device.manufacturer_code !== item.manufacturer_code) {
    throw new Error('设备厂商编号与提供的厂商编号不匹配');
  }
  const measuredAt = item.timestamp ? new Date(item.timestamp) : new Date();
  const state = {
    switch_1: Boolean(Number(item.key1 ?? 0)),
    switch_2: Boolean(Number(item.key2 ?? 0)),
    switch_3: Boolean(Number(item.key3 ?? 0)),
    key1: Boolean(Number(item.key1 ?? 0)),
    key2: Boolean(Number(item.key2 ?? 0)),
    key3: Boolean(Number(item.key3 ?? 0))
  };
  await telemetryStore.saveStatus({
    device,
    moduleType: 'lighting',
    state,
    source,
    rawPayload: item,
    measuredAt
  });
  await telemetryStore.saveElectrical({
    device,
    moduleType: 'lighting',
    data: {
      voltage: item.voltage,
      current: item.current,
      power: item.power,
      energy: item.energy,
      raw_payload: item
    },
    measuredAt
  });
  return device;
};

router.post('/insert', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    if (!req.body.manufacturer_code || !req.body.device_imei) {
      return res.status(400).json({ success: false, message: '厂商编号和设备IMEI为必填字段' });
    }
    await saveLightingItem(req, req.body);
    res.json({ success: true, message: '照明数据插入成功', insertMethod: 'timescaledb' });
  } catch (error) {
    logger.error('插入照明数据失败:', error);
    const status = error.message.includes('不存在') || error.message.includes('无权') ? 404 : 400;
    res.status(status).json({ success: false, message: error.message });
  }
});

router.get('/switch-electrical/latest/:imei', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    const device = await getDevice(req, req.params.imei, 'switch');
    if (!device) return res.status(404).json({ success: false, message: '设备不存在' });
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
        device: {
          id: device.id,
          name: device.name,
          imei: device.imei,
          manufacturer_code: device.manufacturer_code,
          phase_type: device.subtype === 'triple' ? 'three_phase' : (device.subtype || 'single_phase')
        },
        electrical: result.rows[0] ? normalizeElectricalRow(result.rows[0]) : null,
        source: result.rows[0] ? 'switch_electrical_measurements' : 'no_data'
      },
      message: result.rows[0] ? undefined : '暂无电气分析数据'
    });
  } catch (error) {
    logger.error('获取定时开关最新电气分析数据失败:', error);
    res.status(500).json({ success: false, message: '获取定时开关最新电气分析数据失败', error: error.message });
  }
});

router.get('/switch-electrical/history/:imei', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    const device = await getDevice(req, req.params.imei, 'switch');
    if (!device) return res.status(404).json({ success: false, message: '设备不存在' });
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
      `SELECT * FROM switch_electrical_measurements ${where} ORDER BY measured_at DESC LIMIT $${params.length}`,
      params
    );
    res.json({
      success: true,
      data: {
        device: {
          id: device.id,
          name: device.name,
          imei: device.imei,
          manufacturer_code: device.manufacturer_code,
          phase_type: device.subtype === 'triple' ? 'three_phase' : (device.subtype || 'single_phase')
        },
        list: result.rows.map(normalizeElectricalRow),
        total: result.rows.length,
        source: 'switch_electrical_measurements'
      }
    });
  } catch (error) {
    logger.error('获取定时开关电气分析历史失败:', error);
    res.status(500).json({ success: false, message: '获取定时开关电气分析历史失败', error: error.message });
  }
});

router.get('/latest/:imei', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    const device = await getDevice(req, req.params.imei, 'lighting');
    if (!device) return res.status(404).json({ success: false, message: '设备不存在' });
    const [statusResult, electricalResult] = await Promise.all([
      pool.query(
        'SELECT * FROM lighting_latest_status WHERE device_id = $1',
        [device.id]
      ),
      pool.query(
        'SELECT * FROM lighting_latest_electrical WHERE device_id = $1',
        [device.id]
      )
    ]);
    const status = statusResult.rows[0];
    const electrical = electricalResult.rows[0];
    if (!status && !electrical) return res.json({ success: true, data: null, message: '暂无数据' });
    const state = status?.state || {};
    res.json({
      success: true,
      data: {
        id: status?.id || electrical?.id,
        device_id: device.id,
        imei: device.imei,
        voltage: numberOrNull(electrical?.voltage),
        current: numberOrNull(electrical?.current),
        power: numberOrNull(electrical?.power),
        energy: numberOrNull(electrical?.energy),
        switchStates: status ? {
          key1: Boolean(state.key1 ?? state.switch_1),
          key2: Boolean(state.key2 ?? state.switch_2),
          key3: Boolean(state.key3 ?? state.switch_3)
        } : undefined,
        timestamp: status?.measured_at || electrical?.measured_at,
        created_at: status?.created_at || electrical?.created_at
      },
      electricalQuerySource: 'lighting_electrical_measurements'
    });
  } catch (error) {
    logger.error('获取最新照明数据失败:', error);
    res.status(500).json({ success: false, message: '获取最新照明数据失败', error: error.message });
  }
});

router.get('/history/:imei', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    const device = await getDevice(req, req.params.imei, 'lighting');
    if (!device) return res.status(404).json({ success: false, message: '设备不存在' });
    const params = [device.id];
    let where = 'WHERE device_id = $1';
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
      `SELECT * FROM lighting_electrical_measurements ${where} ORDER BY measured_at DESC LIMIT $${params.length}`,
      params
    );
    const deviceData = result.rows.map((row) => ({
      id: row.id,
      device_id: row.device_id,
      imei: row.imei,
      voltage: numberOrNull(row.voltage),
      current: numberOrNull(row.current),
      power: numberOrNull(row.power),
      energy: numberOrNull(row.energy),
      timestamp: row.measured_at,
      created_at: row.created_at
    }));
    res.json({ success: true, data: { deviceData, total: deviceData.length, querySource: 'lighting_electrical_measurements' } });
  } catch (error) {
    logger.error('获取历史照明数据失败:', error);
    res.status(500).json({ success: false, message: '获取历史照明数据失败', error: error.message });
  }
});

router.post('/batch-insert', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    if (!Array.isArray(req.body.data_list) || req.body.data_list.length === 0) {
      return res.status(400).json({ success: false, message: '数据列表不能为空' });
    }
    const results = [];
    for (const item of req.body.data_list) {
      try {
        await saveLightingItem(req, item);
        results.push({ device_imei: item.device_imei, success: true });
      } catch (error) {
        results.push({ device_imei: item.device_imei, success: false, message: error.message });
      }
    }
    res.json({
      success: true,
      message: '批量插入完成',
      data: {
        total: results.length,
        success_count: results.filter((item) => item.success).length,
        failed_count: results.filter((item) => !item.success).length,
        results
      },
      insertMethod: 'timescaledb'
    });
  } catch (error) {
    logger.error('批量插入照明数据失败:', error);
    res.status(500).json({ success: false, message: '批量插入照明数据失败', error: error.message });
  }
});

router.get('/stats/:manufacturer_code', authenticateToken, requirePermission('lighting'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT COUNT(*)::integer AS total_records,
              COUNT(DISTINCT device_id)::integer AS device_count,
              MIN(measured_at) AS earliest_data,
              MAX(measured_at) AS latest_data,
              AVG(voltage) AS avg_voltage,
              AVG(current) AS avg_current,
              AVG(power) AS avg_power,
              SUM(energy) AS total_energy
       FROM lighting_electrical_measurements
       WHERE manufacturer_code = $1`,
      [req.params.manufacturer_code]
    );
    const stats = result.rows[0];
    res.json({
      success: true,
      data: {
        manufacturer_code: req.params.manufacturer_code,
        table_name: 'lighting_electrical_measurements',
        total_records: stats.total_records,
        device_count: stats.device_count,
        earliest_data: stats.earliest_data,
        latest_data: stats.latest_data,
        avg_voltage: numberOrNull(stats.avg_voltage) || 0,
        avg_current: numberOrNull(stats.avg_current) || 0,
        avg_power: numberOrNull(stats.avg_power) || 0,
        total_energy: numberOrNull(stats.total_energy) || 0
      }
    });
  } catch (error) {
    logger.error('获取照明数据统计失败:', error);
    res.status(500).json({ success: false, message: '获取照明数据统计失败', error: error.message });
  }
});

module.exports = router;
