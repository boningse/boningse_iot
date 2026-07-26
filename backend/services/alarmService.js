const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const logger = require('../utils/logger');

const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.ALARM_DB_POOL_MAX, 10) || 5,
  min: 0
});

const ACTIVE_STATUSES = ['active', 'acknowledged', 'assigned', 'processing'];
const MODULE_LABELS = {
  switch: '开关控制',
  lighting: '照明控制',
  thermostat: '温控控制',
  air_conditioner: '空调控制'
};

const isAlarmCode = (value) => {
  if (value === undefined || value === null || value === '') return false;
  const normalized = String(value).trim().toLowerCase();
  return !['0', '00', '0000', 'none', 'normal', 'ok', 'false', '无', '正常'].includes(normalized);
};

const numeric = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const deviceIdentity = (device = {}) => {
  const values = { ...(device.dataValues || {}), ...device };
  return {
    id: values.id || values.device_id,
    tenantId: values.tenant_id,
    name: values.name || values.imei || '设备'
  };
};

const dedupKey = ({ deviceId, moduleType, alarmType, alarmCode = '', metricKey = '' }) =>
  [deviceId, moduleType, alarmType, alarmCode || '', metricKey || ''].join(':');

const createOrUpdateAlarm = async ({
  device,
  moduleType,
  alarmType,
  severity,
  title,
  message,
  alarmCode = null,
  source = 'status',
  metricKey = null,
  metricValue = null,
  thresholdValue = null,
  occurredAt = new Date(),
  metadata = {}
}) => {
  const identity = deviceIdentity(device);
  if (!identity.id || !identity.tenantId) return null;

  const key = dedupKey({
    deviceId: identity.id,
    moduleType,
    alarmType,
    alarmCode,
    metricKey
  });

  const result = await pool.query(
    `INSERT INTO device_alarms (
       tenant_id, device_id, module_type, alarm_type, severity, title, message,
       alarm_code, source, metric_key, metric_value, threshold_value, dedup_key,
       first_occurred_at, last_occurred_at, metadata
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7,
       $8, $9, $10, $11, $12, $13,
       $14, $14, $15::jsonb
     )
     ON CONFLICT (dedup_key) DO UPDATE SET
       severity = EXCLUDED.severity,
       title = EXCLUDED.title,
       message = EXCLUDED.message,
       metric_value = EXCLUDED.metric_value,
       threshold_value = EXCLUDED.threshold_value,
       last_occurred_at = EXCLUDED.last_occurred_at,
       occurrence_count = device_alarms.occurrence_count + 1,
       status = CASE
         WHEN device_alarms.status IN ('resolved', 'closed') THEN 'active'
         ELSE device_alarms.status
       END,
       resolved_by = CASE WHEN device_alarms.status IN ('resolved', 'closed') THEN NULL ELSE device_alarms.resolved_by END,
       resolved_at = CASE WHEN device_alarms.status IN ('resolved', 'closed') THEN NULL ELSE device_alarms.resolved_at END,
       resolution = CASE WHEN device_alarms.status IN ('resolved', 'closed') THEN NULL ELSE device_alarms.resolution END,
       closed_by = CASE WHEN device_alarms.status IN ('resolved', 'closed') THEN NULL ELSE device_alarms.closed_by END,
       closed_at = CASE WHEN device_alarms.status IN ('resolved', 'closed') THEN NULL ELSE device_alarms.closed_at END,
       metadata = device_alarms.metadata || EXCLUDED.metadata,
       updated_at = now()
     WHERE device_alarms.status IN ('resolved', 'closed')
        OR device_alarms.last_occurred_at <= EXCLUDED.last_occurred_at - interval '5 minutes'
     RETURNING *, (xmax = 0) AS inserted`,
    [
      identity.tenantId,
      identity.id,
      moduleType,
      alarmType,
      severity,
      title,
      message,
      alarmCode,
      source,
      metricKey,
      metricValue,
      thresholdValue,
      key,
      occurredAt,
      JSON.stringify(metadata)
    ]
  );

  const alarm = result.rows[0];
  if (!alarm) return null;
  if (alarm.inserted) {
    await pool.query(
      `INSERT INTO device_alarm_actions (
         alarm_id, tenant_id, action, to_status, operator_name, note, metadata
       ) VALUES ($1, $2, 'created', 'active', '系统', $3, $4::jsonb)`,
      [alarm.id, identity.tenantId, message || title, JSON.stringify({ source })]
    );
  }
  return alarm;
};

const evaluateStatus = async ({ device, moduleType, state = {}, measuredAt = new Date() }) => {
  const identity = deviceIdentity(device);
  const moduleLabel = MODULE_LABELS[moduleType] || moduleType;
  const tasks = [];
  const alarmCode = state.alarm_code ?? state.alarmCode ?? state.alarm;
  const errorCode = state.error_code ?? state.errorCode ?? state.error;

  if (moduleType === 'switch' && (state.trip_state === true || state.trip_state === 1 || state.trip_state === 'true')) {
    tasks.push(createOrUpdateAlarm({
      device,
      moduleType,
      alarmType: 'trip',
      severity: 'critical',
      title: `${identity.name}发生跳闸`,
      message: state.trip_reason || '设备上报跳闸状态，请检查负载及线路',
      alarmCode: state.trip_reason || null,
      source: 'status',
      occurredAt: measuredAt,
      metadata: { moduleLabel }
    }));
  }

  if (isAlarmCode(alarmCode)) {
    tasks.push(createOrUpdateAlarm({
      device,
      moduleType,
      alarmType: 'alarm_code',
      severity: moduleType === 'lighting' ? 'medium' : 'high',
      title: `${identity.name}设备告警`,
      message: `${moduleLabel}设备上报告警码：${alarmCode}`,
      alarmCode: String(alarmCode),
      source: 'status',
      occurredAt: measuredAt,
      metadata: { moduleLabel }
    }));
  }

  if (isAlarmCode(errorCode)) {
    tasks.push(createOrUpdateAlarm({
      device,
      moduleType,
      alarmType: 'error_code',
      severity: 'high',
      title: `${identity.name}设备故障`,
      message: `${moduleLabel}设备上报故障码：${errorCode}`,
      alarmCode: String(errorCode),
      source: 'status',
      occurredAt: measuredAt,
      metadata: { moduleLabel }
    }));
  }

  const batteryLevel = numeric(state.battery_level ?? state.batteryLevel);
  if (moduleType === 'thermostat' && batteryLevel !== null && batteryLevel < 20) {
    tasks.push(createOrUpdateAlarm({
      device,
      moduleType,
      alarmType: 'low_battery',
      severity: batteryLevel < 10 ? 'high' : 'medium',
      title: `${identity.name}电量过低`,
      message: `当前电池电量 ${batteryLevel.toFixed(1)}%，请及时更换或充电`,
      source: 'status',
      metricKey: 'battery_level',
      metricValue: batteryLevel,
      thresholdValue: 20,
      occurredAt: measuredAt,
      metadata: { moduleLabel }
    }));
  }

  await Promise.all(tasks);
};

const evaluateElectrical = async ({
  device,
  moduleType,
  data = {},
  phaseType = 'single_phase',
  measuredAt = new Date()
}) => {
  const identity = deviceIdentity(device);
  const tasks = [];
  const addThresholdAlarm = (condition, config) => {
    if (!condition) return;
    tasks.push(createOrUpdateAlarm({
      device,
      moduleType,
      source: 'electrical',
      occurredAt: measuredAt,
      ...config
    }));
  };

  const leakage = numeric(data.leakage_current);
  addThresholdAlarm(leakage !== null && leakage > 30, {
    alarmType: 'leakage_current',
    severity: leakage > 100 ? 'critical' : 'high',
    title: `${identity.name}漏电电流过高`,
    message: `当前漏电电流 ${leakage.toFixed(2)} mA，超过 30 mA 告警阈值`,
    metricKey: 'leakage_current',
    metricValue: leakage,
    thresholdValue: 30
  });

  const temperatureFields = [
    'temperature', 'temperature_a', 'temperature_b', 'temperature_c',
    'cabinet_temperature', 'driver_temperature', 'compressor_temperature'
  ];
  for (const key of temperatureFields) {
    const value = numeric(data[key]);
    const threshold = key === 'compressor_temperature' ? 100 : 80;
    addThresholdAlarm(value !== null && value > threshold, {
      alarmType: 'high_temperature',
      severity: value > threshold + 20 ? 'critical' : 'high',
      title: `${identity.name}温度过高`,
      message: `${key} 当前 ${value?.toFixed(1)}℃，超过 ${threshold}℃ 告警阈值`,
      metricKey: key,
      metricValue: value,
      thresholdValue: threshold
    });
  }

  const phaseVoltages = ['voltage_a', 'voltage_b', 'voltage_c']
    .map((key) => [key, numeric(data[key])])
    .filter(([, value]) => value !== null);
  const voltageItems = phaseVoltages.length
    ? phaseVoltages
    : [['voltage', numeric(data.voltage)]].filter(([, value]) => value !== null);
  for (const [key, value] of voltageItems) {
    const threePhaseLineVoltage = phaseType === 'three_phase' && key === 'voltage';
    const min = threePhaseLineVoltage ? 300 : 180;
    const max = threePhaseLineVoltage ? 450 : 260;
    addThresholdAlarm(value > 0 && (value < min || value > max), {
      alarmType: 'voltage_out_of_range',
      severity: 'medium',
      title: `${identity.name}电压异常`,
      message: `${key} 当前 ${value.toFixed(2)} V，正常范围 ${min}-${max} V`,
      metricKey: key,
      metricValue: value,
      thresholdValue: value < min ? min : max
    });
  }

  const frequency = numeric(data.frequency);
  addThresholdAlarm(frequency !== null && frequency > 0 && (frequency < 45 || frequency > 55), {
    alarmType: 'frequency_out_of_range',
    severity: 'medium',
    title: `${identity.name}频率异常`,
    message: `当前频率 ${frequency.toFixed(2)} Hz，正常范围 45-55 Hz`,
    metricKey: 'frequency',
    metricValue: frequency,
    thresholdValue: frequency < 45 ? 45 : 55
  });

  await Promise.all(tasks);
};

const handleCommunicationStatus = async (device, status) => {
  const identity = deviceIdentity(device);
  if (!identity.id || !identity.tenantId) return;

  if (status === 'offline') {
    const assignments = await pool.query(
      `SELECT module_type
       FROM control_device_assignments
       WHERE device_id = $1 AND tenant_id = $2 AND is_active = true`,
      [identity.id, identity.tenantId]
    );
    await Promise.all(assignments.rows.map(({ module_type: moduleType }) => createOrUpdateAlarm({
      device,
      moduleType,
      alarmType: 'communication_offline',
      severity: 'high',
      title: `${identity.name}通信离线`,
      message: '设备或其上级网关连续 30 分钟无法通信',
      source: 'communication',
      metadata: { offlineTimeoutMinutes: 30 }
    })));
    return;
  }

  if (status === 'online') {
    const resolved = await pool.query(
      `UPDATE device_alarms
       SET status = 'resolved',
           resolved_at = now(),
           resolution = '设备通信恢复，系统自动解除',
           updated_at = now()
       WHERE device_id = $1
         AND alarm_type = 'communication_offline'
         AND status = ANY($2::varchar[])
       RETURNING id, tenant_id`,
      [identity.id, ACTIVE_STATUSES]
    );
    await Promise.all(resolved.rows.map((alarm) => pool.query(
      `INSERT INTO device_alarm_actions (
         alarm_id, tenant_id, action, from_status, to_status, operator_name, note
       ) VALUES ($1, $2, 'auto_resolved', 'active', 'resolved', '系统', '设备通信恢复，系统自动解除')`,
      [alarm.id, alarm.tenant_id]
    )));
  }
};

const bootstrapOfflineAlarms = async () => {
  try {
    const result = await pool.query(
      `SELECT DISTINCT d.id, d.tenant_id, d.name, d.imei
       FROM devices d
       JOIN control_device_assignments cda
         ON cda.device_id = d.id AND cda.tenant_id = d.tenant_id AND cda.is_active = true
       WHERE d.status = 'offline'`
    );
    for (const device of result.rows) {
      await handleCommunicationStatus(device, 'offline');
    }
    logger.info('离线设备告警初始化完成', { deviceCount: result.rowCount });
  } catch (error) {
    logger.error('离线设备告警初始化失败', { error: error.message });
  }
};

module.exports = {
  MODULE_LABELS,
  evaluateStatus,
  evaluateElectrical,
  handleCommunicationStatus,
  bootstrapOfflineAlarms
};
