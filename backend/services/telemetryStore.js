const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');

const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.TELEMETRY_DB_POOL_MAX, 10) || 10,
  min: 0
});

const field = (name, type = 'number') => ({ name, type });

const COMMON_POWER_FIELDS = [
  field('voltage'), field('current'), field('power'), field('active_power'),
  field('reactive_power'), field('apparent_power'), field('power_factor'),
  field('frequency'), field('energy'), field('import_energy'), field('export_energy'),
  field('reactive_import_energy'), field('reactive_export_energy'),
  field('leakage_current'), field('temperature')
];

const COMMON_PHASE_FIELDS = [
  field('voltage_a'), field('voltage_b'), field('voltage_c'),
  field('current_a'), field('current_b'), field('current_c'), field('neutral_current'),
  field('power_a'), field('power_b'), field('power_c'),
  field('reactive_power_a'), field('reactive_power_b'), field('reactive_power_c'),
  field('apparent_power_a'), field('apparent_power_b'), field('apparent_power_c'),
  field('power_factor_a'), field('power_factor_b'), field('power_factor_c'),
  field('temperature_a'), field('temperature_b'), field('temperature_c'), field('cabinet_temperature'),
  field('voltage_thd'), field('voltage_thd_a'), field('voltage_thd_b'), field('voltage_thd_c'),
  field('current_thd'), field('current_thd_a'), field('current_thd_b'), field('current_thd_c'),
  field('demand'), field('max_demand')
];

const MODULE_CONFIG = {
  switch: {
    statusTable: 'switch_status_measurements',
    electricalTable: 'switch_electrical_measurements',
    controlTable: 'switch_control_logs',
    statusFields: [
      field('switch_1', 'boolean'), field('switch_2', 'boolean'), field('switch_3', 'boolean'),
      field('breaker_state', 'text'), field('trip_state', 'boolean'), field('trip_reason', 'text'),
      field('alarm_code', 'text'), field('online', 'boolean')
    ],
    electricalFields: [
      ...COMMON_POWER_FIELDS,
      ...COMMON_PHASE_FIELDS
    ]
  },
  lighting: {
    statusTable: 'lighting_status_measurements',
    electricalTable: 'lighting_electrical_measurements',
    controlTable: 'lighting_control_logs',
    statusFields: [
      field('switch_1', 'boolean'), field('switch_2', 'boolean'), field('switch_3', 'boolean'),
      field('brightness'), field('color_temperature'), field('illuminance'),
      field('scene_code', 'text'), field('channel_states', 'jsonb'),
      field('alarm_code', 'text'), field('online', 'boolean')
    ],
    electricalFields: [
      ...COMMON_POWER_FIELDS,
      ...COMMON_PHASE_FIELDS,
      field('channel_count'), field('channel_measurements', 'jsonb'),
      field('dimming_power'), field('driver_temperature')
    ]
  },
  air_conditioner: {
    statusTable: 'air_conditioner_status_measurements',
    electricalTable: 'air_conditioner_electrical_measurements',
    controlTable: 'air_conditioner_control_logs',
    statusFields: [
      field('power_status', 'boolean'), field('mode', 'text'), field('fan_speed', 'text'),
      field('target_temperature'), field('current_temperature'), field('humidity'),
      field('compressor_state', 'boolean'), field('indoor_fan_state', 'boolean'),
      field('outdoor_fan_state', 'boolean'), field('valve_state', 'text'),
      field('error_code', 'text'), field('alarm_code', 'text'), field('online', 'boolean')
    ],
    electricalFields: [
      ...COMMON_POWER_FIELDS,
      ...COMMON_PHASE_FIELDS,
      field('compressor_current'), field('compressor_power'), field('compressor_temperature'),
      field('indoor_fan_current'), field('indoor_fan_power'),
      field('outdoor_fan_current'), field('outdoor_fan_power'),
      field('heating_energy'), field('cooling_energy'), field('standby_power'),
      field('evaporator_temperature'), field('condenser_temperature'),
      field('suction_pressure'), field('discharge_pressure')
    ]
  },
  thermostat: {
    statusTable: 'thermostat_status_measurements',
    electricalTable: 'thermostat_electrical_measurements',
    controlTable: 'thermostat_control_logs',
    statusFields: [
      field('power_status', 'boolean'), field('mode', 'text'), field('fan_speed', 'text'),
      field('target_temperature'), field('current_temperature'), field('humidity'),
      field('valve_state', 'text'), field('relay_state', 'boolean'), field('key_lock', 'boolean'),
      field('battery_level'), field('error_code', 'text'), field('online', 'boolean')
    ],
    electricalFields: [
      ...COMMON_POWER_FIELDS,
      ...COMMON_PHASE_FIELDS,
      field('relay_current'), field('relay_power'),
      field('fan_current'), field('fan_power'),
      field('valve_current'), field('valve_power'),
      field('standby_power'), field('battery_voltage'), field('battery_level')
    ]
  }
};

const MODULE_TYPES = new Set(Object.keys(MODULE_CONFIG));
const ELECTRICAL_FIELDS = [...new Set(
  Object.values(MODULE_CONFIG).flatMap((config) => config.electricalFields.map((item) => item.name))
)];

const assertModuleType = (moduleType) => {
  if (!MODULE_TYPES.has(moduleType)) {
    throw new Error(`Unsupported control module type: ${moduleType}`);
  }
};

const compactObject = (value = {}) => Object.fromEntries(
  Object.entries(value).filter(([, item]) => item !== undefined)
);

const deviceValues = (device) => {
  const modelValues = device?.dataValues || {};
  const values = { ...modelValues, ...(device || {}) };
  return {
    deviceId: values.id || values.device_id,
    tenantId: values.tenant_id,
    manufacturerCode: values.manufacturer_code || null,
    imei: values.imei || values.device_code
  };
};

const normalizeFieldValue = (definition, value) => {
  if (value === undefined || value === null || value === '') return null;
  if (definition.type === 'jsonb') return JSON.stringify(value);
  if (definition.type === 'boolean') {
    if (typeof value === 'string') return ['true', '1', 'on', 'open'].includes(value.toLowerCase());
    return Boolean(value);
  }
  if (definition.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
  return String(value);
};

const stateValue = (state, name) => {
  const aliases = {
    switch_1: ['switch_1', 'key1'],
    switch_2: ['switch_2', 'key2'],
    switch_3: ['switch_3', 'key3'],
    mode: ['mode', 'ac_mode'],
    target_temperature: ['target_temperature', 'target_temp'],
    current_temperature: ['current_temperature', 'current_temp'],
    power_status: ['power_status', 'power_state']
  };
  const keys = aliases[name] || [name];
  const key = keys.find((candidate) => state[candidate] !== undefined);
  return key ? state[key] : undefined;
};

const valuesSql = (startIndex, fields) => fields.map((definition, index) => {
  const placeholder = `$${startIndex + index}`;
  return definition.type === 'jsonb' ? `${placeholder}::jsonb` : placeholder;
}).join(', ');

const saveStatus = async ({ device, moduleType, state, source = 'mqtt', rawPayload = {}, measuredAt = new Date() }) => {
  assertModuleType(moduleType);
  const config = MODULE_CONFIG[moduleType];
  const identity = deviceValues(device);
  const knownValues = config.statusFields.map((definition) => normalizeFieldValue(
    definition,
    stateValue(state || {}, definition.name)
  ));
  const fieldNames = config.statusFields.map((definition) => definition.name);
  const result = await pool.query(
    `INSERT INTO ${config.statusTable} (
       measured_at, device_id, tenant_id, manufacturer_code, imei,
       ${fieldNames.join(', ')}, state, source, raw_payload
     ) VALUES ($1, $2, $3, $4, $5, ${valuesSql(6, config.statusFields)},
       $${config.statusFields.length + 6}::jsonb,
       $${config.statusFields.length + 7},
       $${config.statusFields.length + 8}::jsonb)
     RETURNING id, measured_at`,
    [
      measuredAt,
      identity.deviceId,
      identity.tenantId,
      identity.manufacturerCode,
      identity.imei,
      ...knownValues,
      JSON.stringify(compactObject(state || {})),
      source,
      JSON.stringify(rawPayload || {})
    ]
  );
  return result.rows[0];
};

const saveElectrical = async ({ device, moduleType, data, phaseType = 'single_phase', measuredAt = new Date() }) => {
  assertModuleType(moduleType);
  const config = MODULE_CONFIG[moduleType];
  const identity = deviceValues(device);
  const knownNames = new Set(config.electricalFields.map((item) => item.name));
  const extraMetrics = compactObject({
    ...(data.extra_metrics || {}),
    ...Object.fromEntries(Object.entries(data || {}).filter(([key]) => !knownNames.has(key) && !['raw_payload', 'extra_metrics'].includes(key)))
  });
  const knownValues = config.electricalFields.map((definition) => normalizeFieldValue(definition, data[definition.name]));
  const hasValue = knownValues.some((value) => value !== null) || Object.keys(extraMetrics).length > 0;
  if (!hasValue) return { skipped: true, reason: 'no_electrical_fields' };

  const fieldNames = config.electricalFields.map((definition) => definition.name);
  const result = await pool.query(
    `INSERT INTO ${config.electricalTable} (
       measured_at, device_id, tenant_id, manufacturer_code, imei, phase_type,
       ${fieldNames.join(', ')}, extra_metrics, raw_payload
     ) VALUES ($1, $2, $3, $4, $5, $6, ${valuesSql(7, config.electricalFields)},
       $${config.electricalFields.length + 7}::jsonb,
       $${config.electricalFields.length + 8}::jsonb)
     RETURNING id, measured_at`,
    [
      measuredAt,
      identity.deviceId,
      identity.tenantId,
      identity.manufacturerCode,
      identity.imei,
      phaseType,
      ...knownValues,
      JSON.stringify(extraMetrics),
      JSON.stringify(data.raw_payload || data)
    ]
  );
  return result.rows[0];
};

const logControl = async ({
  device,
  moduleType,
  action,
  command,
  encodedPayload = null,
  mqttTopic = null,
  status,
  errorMessage = null,
  userId = null,
  controlSource = 'manual'
}) => {
  assertModuleType(moduleType);
  const config = MODULE_CONFIG[moduleType];
  const identity = deviceValues(device);
  const result = await pool.query(
    `INSERT INTO ${config.controlTable} (
       tenant_id, device_id, action, command, encoded_payload,
       mqtt_topic, status, error_message, user_id, control_source
     ) VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $8, $9, $10)
     RETURNING id, created_at`,
    [
      identity.tenantId,
      identity.deviceId,
      action,
      JSON.stringify(command || {}),
      encodedPayload === null ? null : JSON.stringify(encodedPayload),
      mqttTopic,
      status,
      errorMessage,
      userId,
      controlSource
    ]
  );
  return result.rows[0];
};

module.exports = {
  ELECTRICAL_FIELDS,
  MODULE_CONFIG,
  saveStatus,
  saveElectrical,
  logControl
};
