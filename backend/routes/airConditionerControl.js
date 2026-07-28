const express = require('express');
const { Pool } = require('pg');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { getPoolConfig } = require('../config/database');
const mqttService = require('../services/mqttService');
const { buildDa51kdCommand } = require('../utils/da51kdProtocol');
const telemetryStore = require('../services/telemetryStore');

const router = express.Router();
const pool = new Pool(getPoolConfig());

const AIR_DEVICE_TYPE = '分散空调控制器';
const isAdminUser = (user) => user && (user.role === 'admin' || user.role === 'super_admin');

const collectProtocolFields = (config) => {
  const fields = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (Array.isArray(value.fields)) fields.push(...value.fields);
    Object.entries(value).forEach(([key, child]) => {
      if (key !== 'fields') visit(child);
    });
  };
  visit(config);
  const unique = new Map();
  fields.forEach((item) => {
    const key = item?.target || item?.name;
    if (key && !unique.has(key)) {
      unique.set(key, {
        key,
        label: item.label || item.description || key,
        unit: item.unit || '',
        type: item.type || item.data_type || 'number',
        supported: item.supported !== false
      });
    }
  });
  return [...unique.values()];
};

const findAssignedDevice = async (req, deviceId) => {
  const params = [deviceId];
  let tenantClause = '';
  if (!isAdminUser(req.user)) {
    params.push(req.user.tenant_id);
    tenantClause = ` AND acc.tenant_id = $${params.length}`;
  }
  const result = await pool.query(
    `SELECT d.id, d.name, d.imei, d.device_id, d.status, d.location, d.description,
            d.tenant_id, d.manufacturer_code, d.protocol_config_id,
            d.project_building_id, d.project_group_id,
            pc.name AS protocol_name, pc.data_parsing_config AS protocol_data_parsing_config,
            t.name AS tenant_name, pb.name AS project_building_name, pg.name AS project_group_name
     FROM control_device_assignments acc
     JOIN devices d ON d.id = acc.device_id
     LEFT JOIN tenants t ON t.id = d.tenant_id
     LEFT JOIN project_buildings pb ON pb.id = d.project_building_id
     LEFT JOIN project_groups pg ON pg.id = d.project_group_id
     LEFT JOIN protocol_configs pc ON pc.id = d.protocol_config_id
     WHERE (d.id::text = $1 OR d.imei = $1 OR d.device_id = $1)
       AND acc.module_type = 'air_conditioner'
       AND acc.is_active = true${tenantClause}
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
    let where = `WHERE acc.is_active = true
      AND acc.module_type = 'air_conditioner'
      AND d.is_air_conditioner = true
      AND COALESCE(d.device_category, 'standalone') <> 'gateway'`;

    if (isAdminUser(req.user)) {
      if (req.query.tenantId && req.query.tenantId !== "undefined") {
        params.push(req.query.tenantId);
        where += ` AND acc.tenant_id = $${params.length}`;
      }
    } else {
      params.push(req.user.tenant_id);
      where += ` AND acc.tenant_id = $${params.length}`;
    }

    if (req.query.keyword && req.query.keyword !== "undefined") {
      params.push(`%${req.query.keyword}%`);
      where += ` AND (d.name ILIKE $${params.length} OR d.imei ILIKE $${params.length} OR d.device_id ILIKE $${params.length})`;
    }
    if (req.query.status && req.query.status !== "undefined") {
      params.push(req.query.status);
      where += ` AND d.status = $${params.length}`;
    }
    if (req.query.buildingId && req.query.buildingId !== "undefined") {
      params.push(req.query.buildingId);
      where += ` AND d.project_building_id = $${params.length}`;
    }
    if (req.query.projectGroupId && req.query.projectGroupId !== "undefined") {
      params.push(req.query.projectGroupId);
      where += ` AND d.project_group_id = $${params.length}`;
    }

    const baseFrom = `
      FROM control_device_assignments acc
      JOIN devices d ON acc.device_id = d.id
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      LEFT JOIN tenants t ON acc.tenant_id = t.id
      LEFT JOIN project_buildings pb ON d.project_building_id = pb.id
      LEFT JOIN project_groups pg ON d.project_group_id = pg.id
      LEFT JOIN LATERAL (
        SELECT
          power_status, mode, fan_speed, target_temperature, current_temperature, humidity
        FROM air_conditioner_latest_status
        WHERE device_id = d.id
      ) status_data ON true
      LEFT JOIN LATERAL (
        SELECT *
        FROM air_conditioner_latest_electrical
        WHERE device_id = d.id
      ) electrical_data ON true
      ${where}
    `;

    const query = `
      SELECT acc.id as control_id, NULL::text AS group_name, acc.display_order,
             acc.config->'strategy_config' AS strategy_config,
             d.id, d.name, d.device_id, d.imei, d.status, d.location, d.description,
             d.tenant_id, d.manufacturer_code, d.project_building_id, d.project_group_id,
             dt.name as device_type_name, t.name as tenant_name,
             pb.name as project_building_name, pg.name as project_group_name,
             status_data.power_status, status_data.mode, status_data.fan_speed,
             status_data.target_temperature, status_data.current_temperature, status_data.humidity,
             electrical_data.voltage, electrical_data.current, electrical_data.power, electrical_data.energy
      ${baseFrom}
      ORDER BY acc.display_order ASC, acc.created_at ASC
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
        list: result.rows,
        total,
        pagination: { total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
      }
    });
  } catch (error) {
    logger.error('获取分散空调控制设备列表失败:', error);
    res.status(500).json({ success: false, message: '获取分散空调控制设备列表失败', error: error.message });
  }
});

router.post('/sync-devices', authenticateToken, async (req, res) => {
  try {
    const params = [AIR_DEVICE_TYPE];
    let tenantClause = '';
    if (isAdminUser(req.user)) {
      if ((req.body.tenantId && req.body.tenantId !== "undefined") || (req.query.tenantId && req.query.tenantId !== "undefined")) {
        params.push(req.body.tenantId || req.query.tenantId);
        tenantClause = ` AND d.tenant_id = $${params.length}`;
      }
    } else {
      params.push(req.user.tenant_id);
      tenantClause = ` AND d.tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `INSERT INTO control_device_assignments (tenant_id, device_id, module_type, is_active)
       SELECT d.tenant_id, d.id, 'air_conditioner', true
       FROM devices d
       JOIN device_types dt ON dt.id = d.device_type_id
       WHERE dt.name = $1
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'${tenantClause}
         AND NOT EXISTS (
           SELECT 1 FROM control_device_assignments assignment
           WHERE assignment.device_id = d.id AND assignment.is_active = true
         )
       ON CONFLICT (device_id, module_type) DO UPDATE
       SET tenant_id = EXCLUDED.tenant_id, is_active = true, updated_at = CURRENT_TIMESTAMP
       RETURNING id, device_id`,
      params
    );
    if (result.rows.length > 0) {
      await pool.query(
        'UPDATE devices SET is_air_conditioner = true, updated_at = CURRENT_TIMESTAMP WHERE id = ANY($1::uuid[])',
        [result.rows.map((row) => row.device_id)]
      );
    }
    res.json({ success: true, message: '分散空调控制设备已同步', data: { count: result.rows.length } });
  } catch (error) {
    logger.error('同步分散空调控制设备失败:', error);
    res.status(500).json({ success: false, message: '同步分散空调控制设备失败', error: error.message });
  }
});

router.put('/strategy', authenticateToken, async (req, res) => {
  try {
    const deviceIds = Array.isArray(req.body.deviceIds) ? req.body.deviceIds.filter(Boolean) : [];
    const strategy = req.body.strategy;
    if (!deviceIds.length || !strategy || typeof strategy !== 'object') {
      return res.status(400).json({ success: false, message: '设备范围和策略内容不能为空' });
    }

    const params = [deviceIds, JSON.stringify(strategy)];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE control_device_assignments
       SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{strategy_config}', $2::jsonb, true),
           updated_at = CURRENT_TIMESTAMP
       WHERE device_id = ANY($1::uuid[])
         AND module_type = 'air_conditioner'
         AND is_active = true${tenantClause}
       RETURNING device_id`,
      params
    );
    if (!result.rows.length) {
      return res.status(404).json({ success: false, message: '未找到可保存策略的空调设备' });
    }
    res.json({
      success: true,
      message: '空调策略已保存',
      data: { count: result.rows.length, deviceIds: result.rows.map((row) => row.device_id) }
    });
  } catch (error) {
    logger.error('保存分散空调策略失败:', error);
    res.status(500).json({ success: false, message: '保存分散空调策略失败', error: error.message });
  }
});

router.get('/:deviceId/detail', authenticateToken, async (req, res) => {
  try {
    const device = await findAssignedDevice(req, req.params.deviceId);
    if (!device) {
      return res.status(404).json({ success: false, message: '设备不存在或不在分散空调控制列表中' });
    }

    const protocolFields = collectProtocolFields(device.protocol_data_parsing_config);
    delete device.protocol_data_parsing_config;
    const hours = Math.min(Math.max(parseInt(req.query.hours, 10) || 24, 1), 2160);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 500, 10), 2000);
    const electricalFields = `
      measured_at, phase_type, voltage, current, power, active_power, reactive_power,
      apparent_power, power_factor, frequency, energy, import_energy, export_energy,
      leakage_current, temperature, voltage_a, voltage_b, voltage_c,
      current_a, current_b, current_c, power_a, power_b, power_c,
      temperature_a, temperature_b, temperature_c, cabinet_temperature,
      compressor_current, compressor_power, compressor_temperature,
      indoor_fan_current, indoor_fan_power, outdoor_fan_current, outdoor_fan_power,
      heating_energy, cooling_energy, standby_power, evaporator_temperature,
      condenser_temperature, suction_pressure, discharge_pressure, extra_metrics`;

    const [statusResult, latestResult, historyResult, summaryResult, controlsResult] = await Promise.all([
      pool.query(
        `SELECT power_status, mode, fan_speed, target_temperature, current_temperature,
                humidity, compressor_state, indoor_fan_state, outdoor_fan_state,
                valve_state, error_code, alarm_code, online, state, measured_at
         FROM air_conditioner_latest_status WHERE device_id = $1`,
        [device.id]
      ),
      pool.query(
        `SELECT ${electricalFields}
         FROM air_conditioner_electrical_measurements
         WHERE device_id = $1 ORDER BY measured_at DESC LIMIT 1`,
        [device.id]
      ),
      pool.query(
        `SELECT * FROM (
           SELECT ${electricalFields}
           FROM air_conditioner_electrical_measurements
           WHERE device_id = $1
             AND measured_at >= NOW() - make_interval(hours => $2::int)
           ORDER BY measured_at DESC
           LIMIT $3
         ) samples ORDER BY measured_at ASC`,
        [device.id, hours, limit]
      ),
      pool.query(
        `SELECT COUNT(*)::integer AS sample_count,
                AVG(current) AS avg_current, MAX(current) AS max_current,
                AVG(COALESCE(active_power, power)) AS avg_power,
                MAX(COALESCE(active_power, power)) AS max_power,
                MAX(energy) - MIN(energy) AS energy_usage,
                AVG(compressor_current) AS avg_compressor_current,
                MAX(compressor_temperature) AS max_compressor_temperature,
                AVG(evaporator_temperature) AS avg_evaporator_temperature,
                AVG(condenser_temperature) AS avg_condenser_temperature
         FROM air_conditioner_electrical_measurements
         WHERE device_id = $1
           AND measured_at >= NOW() - make_interval(hours => $2::int)`,
        [device.id, hours]
      ),
      pool.query(
        `SELECT action, command, status, error_message, created_at
         FROM air_conditioner_control_logs
         WHERE device_id = $1 ORDER BY created_at DESC LIMIT 20`,
        [device.id]
      )
    ]);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({
      success: true,
      data: {
        device,
        status: statusResult.rows[0] || null,
        latestElectrical: latestResult.rows[0] || null,
        electricalHistory: historyResult.rows,
        electricalSummary: summaryResult.rows[0] || {},
        controlHistory: controlsResult.rows,
        protocolFields,
        rangeHours: hours
      }
    });
  } catch (error) {
    logger.error('获取分散空调设备详情失败:', error);
    res.status(500).json({ success: false, message: '获取分散空调设备详情失败', error: error.message });
  }
});

router.post('/:deviceId/control', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const command = req.body.command || req.body;
    if (!command || typeof command !== 'object') {
      return res.status(400).json({ success: false, message: '控制命令不能为空' });
    }

    const params = [deviceId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND acc.tenant_id = $${params.length}`;
    }
    const deviceResult = await pool.query(
      `SELECT acc.id as control_id, acc.tenant_id, d.id, d.imei, d.name, d.device_id, d.manufacturer_code,
              status_data.power_status, status_data.mode, status_data.fan_speed,
              status_data.target_temperature, status_data.current_temperature, status_data.humidity
       FROM control_device_assignments acc
       JOIN devices d ON acc.device_id = d.id
       LEFT JOIN LATERAL (
         SELECT
           power_status, mode, fan_speed, target_temperature,
           current_temperature, humidity
         FROM air_conditioner_latest_status
         WHERE device_id = d.id
       ) status_data ON true
       WHERE (d.id::text = $1 OR d.imei = $1 OR d.device_id = $1)${tenantClause}
         AND acc.module_type = 'air_conditioner'
         AND acc.is_active = true
         AND d.is_air_conditioner = true
         AND COALESCE(d.device_category, 'standalone') <> 'gateway'
       LIMIT 1`,
      params
    );
    if (deviceResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: '设备不存在或不在分散空调控制列表中' });
    }
    const device = deviceResult.rows[0];
    const isDa51kd = String(device.manufacturer_code || '').trim().toUpperCase() === 'DA51KD';
    let mqttCommand = command;
    let encodedCommand = null;

    if (isDa51kd) {
      try {
        encodedCommand = buildDa51kdCommand(command, device);
        mqttCommand = { data: encodedCommand.base64 };
      } catch (protocolError) {
        return res.status(400).json({ success: false, message: protocolError.message });
      }
    }

    try {
      await mqttService.sendCommandToDevice(device.imei, mqttCommand);
    } catch (mqttError) {
      logger.error('分散空调MQTT控制指令发送失败', { imei: device.imei, error: mqttError.message });
      await telemetryStore.logControl({
        device,
        moduleType: 'air_conditioner',
        action: command.action || 'air_conditioner_control',
        command,
        encodedPayload: encodedCommand ? { protocol: 'DA51KD', hex: encodedCommand.hex, mqtt_payload: mqttCommand } : mqttCommand,
        status: 'failed',
        errorMessage: mqttError.message,
        userId: req.user.id
      });
      return res.status(502).json({ success: false, message: '分散空调MQTT控制指令发送失败', error: mqttError.message });
    }

    const status = {
      power_status: device.power_status,
      mode: device.mode,
      fan_speed: device.fan_speed,
      target_temperature: device.target_temperature,
      current_temperature: device.current_temperature,
      humidity: device.humidity,
      online: true,
      ...(encodedCommand ? encodedCommand.state : {})
    };
    if (!encodedCommand && (command.action === 'set_power' || command.power_state !== undefined)) status.power_status = Boolean(Number(command.power_state));
    if (!encodedCommand && (command.action === 'set_mode' || command.mode !== undefined)) status.mode = command.mode;
    if (!encodedCommand && (command.action === 'set_fan_speed' || command.fan_speed !== undefined)) status.fan_speed = command.fan_speed;
    if (!encodedCommand && (command.action === 'set_temperature' || command.target_temperature !== undefined)) status.target_temperature = command.target_temperature;

    await telemetryStore.saveStatus({
      device,
      moduleType: 'air_conditioner',
      state: status,
      source: 'control_command',
      rawPayload: {
        command,
        ...(encodedCommand ? { protocol: 'DA51KD', hex: encodedCommand.hex } : {})
      }
    });

    await telemetryStore.logControl({
      device,
      moduleType: 'air_conditioner',
      action: command.action || 'air_conditioner_control',
      command,
      encodedPayload: encodedCommand ? { protocol: 'DA51KD', hex: encodedCommand.hex, mqtt_payload: mqttCommand } : mqttCommand,
      status: 'sent',
      userId: req.user.id
    });

    res.json({
      success: true,
      message: '分散空调控制指令发送成功',
      data: {
        device_id: device.id,
        device_imei: device.imei,
        command,
        ...(encodedCommand ? { protocol: 'DA51KD', encoded_hex: encodedCommand.hex } : {})
      }
    });
  } catch (error) {
    logger.error('控制分散空调失败:', error);
    res.status(500).json({ success: false, message: '控制分散空调失败', error: error.message });
  }
});

router.delete('/:deviceId', authenticateToken, async (req, res) => {
  try {
    const params = [req.params.deviceId];
    let tenantClause = '';
    if (!isAdminUser(req.user)) {
      params.push(req.user.tenant_id);
      tenantClause = ` AND tenant_id = $${params.length}`;
    }
    const result = await pool.query(
      `UPDATE control_device_assignments
       SET is_active = false, updated_at = CURRENT_TIMESTAMP
       WHERE device_id = $1 AND module_type = 'air_conditioner'${tenantClause} AND is_active = true
       RETURNING id, device_id`,
      params
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: '分散空调控制设备不存在' });
    }
    await pool.query(
      'UPDATE devices SET is_air_conditioner = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [result.rows[0].device_id]
    );
    res.json({ success: true, message: '分散空调控制设备已移除' });
  } catch (error) {
    logger.error('移除分散空调控制设备失败:', error);
    res.status(500).json({ success: false, message: '移除分散空调控制设备失败', error: error.message });
  }
});

module.exports = router;
