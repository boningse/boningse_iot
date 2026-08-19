const axios = require('axios');
const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');

const pool = new Pool(getPoolConfig());
const PUSH_ENDPOINT = 'https://caiji.boningse.com/api/electrical/upload-data';
const running = new Set();

const METRICS = Object.freeze({
  voltage: { paraname: '电压', unit: 'V' },
  current: { paraname: '电流有效值', unit: 'A' },
  power: { paraname: '有功功率', unit: 'W' },
  active_power: { paraname: '总有功功率', unit: 'W' },
  reactive_power: { paraname: '总无功功率', unit: 'var' },
  apparent_power: { paraname: '总视在功率', unit: 'VA' },
  power_factor: { paraname: '功率因数', unit: '' },
  frequency: { paraname: '频率', unit: 'Hz' },
  energy: { paraname: '累计电量', unit: 'kWh' },
  import_energy: { paraname: '正向有功电量', unit: 'kWh' },
  export_energy: { paraname: '反向有功电量', unit: 'kWh' },
  leakage_current: { paraname: '漏电流', unit: 'mA' },
  temperature: { paraname: '温度', unit: '℃' }
});

const SOURCE_TABLES = Object.freeze({
  switch: 'switch_latest_electrical',
  lighting: 'lighting_latest_electrical',
  thermostat: 'thermostat_latest_electrical',
  air_conditioner: 'air_conditioner_latest_electrical'
});

function latestSql(dataSource) {
  const table = SOURCE_TABLES[dataSource] || SOURCE_TABLES.switch;
  return `SELECT * FROM ${table} WHERE device_id = $1 ORDER BY measured_at DESC LIMIT 1`;
}

function formatReportTime(value) {
  const parts = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(new Date(value));
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

function normalizeMetricFields(fields) {
  return [...new Set(Array.isArray(fields) ? fields : [])].filter((field) => METRICS[field]);
}

function buildPayload(config, measurement) {
  const metricFields = normalizeMetricFields(config.metric_fields);
  const data = metricFields.flatMap((field) => {
    const value = Number(measurement[field]);
    if (!Number.isFinite(value)) return [];
    return [{
      insname: String(config.insname),
      propertyno: String(config.propertyno),
      paraname: METRICS[field].paraname,
      value,
      quality: 1
    }];
  });
  if (!data.length) throw new Error('最新数据中没有所选推送指标的有效数值');
  return {
    projectCode: String(config.project_code),
    deviceCode: String(config.external_device_code),
    reportTime: formatReportTime(measurement.measured_at),
    data
  };
}

async function writeLog(config, measurement, status, details = {}) {
  await pool.query(
    `INSERT INTO electrical_push_logs
       (config_id, tenant_id, device_id, measurement_at, status, http_status,
        request_payload, response_body, error_message)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [config.id, config.tenant_id, config.device_id, measurement?.measured_at || null,
      status, details.httpStatus || null, details.payload || null,
      details.responseBody || null, details.errorMessage || null]
  );
}

async function pushConfig(configOrId, { force = false } = {}) {
  const id = typeof configOrId === 'string' ? configOrId : configOrId.id;
  if (running.has(id)) return { success: false, skipped: true, message: '该设备正在推送中' };
  running.add(id);
  try {
    const configResult = typeof configOrId === 'string'
      ? await pool.query('SELECT * FROM electrical_push_configs WHERE id = $1', [id])
      : { rows: [configOrId] };
    const config = configResult.rows[0];
    if (!config) throw new Error('推送配置不存在');
    if (!config.enabled && !force) return { success: false, skipped: true, message: '配置未启用' };

    const measurementResult = await pool.query(latestSql(config.data_source), [config.device_id]);
    const measurement = measurementResult.rows[0];
    if (!measurement) throw new Error('设备暂无电气数据');
    if (!force && config.last_pushed_measurement_at &&
        new Date(measurement.measured_at) <= new Date(config.last_pushed_measurement_at)) {
      return { success: true, skipped: true, message: '暂无新的电气数据' };
    }

    const payload = buildPayload(config, measurement);
    await pool.query('UPDATE electrical_push_configs SET last_attempt_at = now(), updated_at = now() WHERE id = $1', [config.id]);
    try {
      const response = await axios.post(PUSH_ENDPOINT, payload, {
        timeout: 15000,
        headers: { 'Content-Type': 'application/json' },
        validateStatus: () => true
      });
      const responseText = typeof response.data === 'string'
        ? response.data.slice(0, 4000)
        : JSON.stringify(response.data ?? {}).slice(0, 4000);
      const accepted = response.status >= 200 && response.status < 300 && response.data?.success !== false;
      if (!accepted) throw Object.assign(new Error(`对方接口返回 ${response.status}`), {
        httpStatus: response.status, responseText
      });
      await pool.query(
        `UPDATE electrical_push_configs
         SET last_pushed_measurement_at=$2, last_success_at=now(), last_error=NULL, updated_at=now()
         WHERE id=$1`, [config.id, measurement.measured_at]
      );
      await writeLog(config, measurement, 'success', {
        httpStatus: response.status, payload, responseBody: responseText
      });
      return { success: true, message: '数据推送成功', payload, response: response.data };
    } catch (error) {
      const message = String(error.message || '推送失败').slice(0, 1000);
      await pool.query(
        'UPDATE electrical_push_configs SET last_error=$2, updated_at=now() WHERE id=$1',
        [config.id, message]
      );
      await writeLog(config, measurement, 'failed', {
        httpStatus: error.httpStatus || error.response?.status,
        payload,
        responseBody: error.responseText || JSON.stringify(error.response?.data ?? '').slice(0, 4000),
        errorMessage: message
      });
      throw error;
    }
  } finally {
    running.delete(id);
  }
}

async function pushDueConfigs() {
  const due = await pool.query(
    `SELECT * FROM electrical_push_configs
     WHERE enabled = true
       AND (last_attempt_at IS NULL OR last_attempt_at <= now() - make_interval(mins => interval_minutes))
     ORDER BY COALESCE(last_attempt_at, to_timestamp(0)) ASC
     LIMIT 100`
  );
  const results = await Promise.allSettled(due.rows.map((config) => pushConfig(config)));
  const failed = results.filter((result) => result.status === 'rejected');
  if (failed.length) logger.warn('部分电气数据推送失败', { failed: failed.length, total: results.length });
  return { total: results.length, failed: failed.length };
}

module.exports = {
  PUSH_ENDPOINT,
  METRICS,
  SOURCE_TABLES,
  latestSql,
  formatReportTime,
  normalizeMetricFields,
  buildPayload,
  pushConfig,
  pushDueConfigs
};
