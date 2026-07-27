BEGIN;

UPDATE manufacturers
SET tenant_id = 'a594401a-2b16-4c0e-9515-adad1b5b80a4'
WHERE code = 'ZQC'
  AND tenant_id IS NULL;

WITH payload AS (
  SELECT
    'ZQC 4G定时开关 MQTT JSON V200'::varchar(255) AS name,
    'V200'::varchar(50) AS version,
    'json'::enum_protocol_configs_protocol_type AS protocol_type,
    'ZQC'::varchar(20) AS manufacturer_code,
    '定时开关'::varchar(100) AS device_type,
    '4G定时开关/智能断路器 MQTT JSON 协议。Topic: {corp}/json/IoT/GW/V200/{gatewayMac}/{direction}/json/{bizTopic}，支持设备注册、上线下线、开关状态、采集数据、分合闸控制、定时任务和维护指令。'::text AS description,
    '{
      "format": "json",
      "protocol": "mqtt",
      "topic_template": "{corp}/json/IoT/GW/V200/{gatewayMac}/{direction}/json/{bizTopic}",
      "identity": {
        "gatewayMac": "topic[5]",
        "deviceAddress": "devices[].addr 或 payload.addr",
        "physicalDeviceKey": "{gatewayMac}:{addr}"
      },
      "packTypeRouting": {
        "devRegister": "DeviceRegister",
        "devOnline": "DeviceOnline",
        "devOffline": "DeviceOffline",
        "Switch": "CB/Switch",
        "devData": "CB",
        "CBControl": "CB",
        "GetData": "CB",
        "taskSet": "taskSet"
      },
      "fields": [
        { "source": "packType", "target": "message_type", "name": "message_type", "type": "string", "scale": 1, "unit": "", "description": "包类型，用于分流业务" },
        { "source": "timestamp", "target": "device_time", "name": "device_time", "type": "number", "scale": 1, "unit": "s", "description": "UNIX时间戳" },
        { "source": "devices[].addr", "target": "device_address", "name": "device_address", "type": "number", "scale": 1, "unit": "", "description": "断路器地址" },
        { "source": "devices[].type", "target": "device_type_code", "name": "device_type_code", "type": "string", "scale": 1, "unit": "", "description": "厂家设备类型码" },
        { "source": "currentMap", "target": "power_state", "name": "power_state", "type": "string", "scale": 1, "unit": "", "description": "当前开关状态位图，1=开/合闸，0=关/分闸" },
        { "source": "updatedMap", "target": "changed_state_map", "name": "changed_state_map", "type": "string", "scale": 1, "unit": "", "description": "变化状态位图" },
        { "source": "devices[].flags", "target": "fault_code", "name": "fault_code", "type": "string", "scale": 1, "unit": "", "description": "状态/告警信息位" },
        { "source": "devices[].mt", "target": "module_temperature", "name": "module_temperature", "type": "number", "scale": 0.1, "unit": "°C", "description": "模块温度，原值/10" },
        { "source": "devices[].le", "target": "leakage_current", "name": "leakage_current", "type": "number", "scale": 1, "unit": "mA", "description": "剩余电流/漏电流" },
        { "source": "devices[].freq", "target": "frequency", "name": "frequency", "type": "number", "scale": 0.1, "unit": "Hz", "description": "电网频率，原值/10" },
        { "source": "devices[].voltA", "target": "voltage", "name": "voltage", "type": "number", "scale": 0.01, "unit": "V", "description": "A相/单相电压，原值/100" },
        { "source": "devices[].currA", "target": "current", "name": "current", "type": "number", "scale": 0.001, "unit": "A", "description": "A相/单相电流，原值/1000" },
        { "source": "devices[].aPA", "target": "power", "name": "power", "type": "number", "scale": 0.001, "unit": "W", "description": "A相/单相有功功率，原值/1000" },
        { "source": "devices[].aEA", "target": "energy", "name": "energy", "type": "number", "scale": 1, "unit": "Wh", "description": "A相/单相有功电能" },
        { "source": "devices[].ltA", "target": "temperature_a", "name": "line_temperature_a", "type": "number", "scale": 0.1, "unit": "°C", "description": "A相/单相线温，原值/10" },
        { "source": "devices[].ltB", "target": "temperature_b", "name": "line_temperature_b", "type": "number", "scale": 0.1, "unit": "°C", "description": "B相线温，原值/10" },
        { "source": "devices[].ltC", "target": "temperature_c", "name": "line_temperature_c", "type": "number", "scale": 0.1, "unit": "°C", "description": "C相线温，原值/10" },
        { "source": "devices[].aPT", "target": "total_active_power", "name": "total_active_power", "type": "number", "scale": 0.001, "unit": "W", "description": "总有功功率，原值/1000" },
        { "source": "devices[].aET", "target": "total_active_energy", "name": "total_active_energy", "type": "number", "scale": 1, "unit": "Wh", "description": "总有功电能" },
        { "source": "devices[].voltB", "target": "voltage_b", "name": "voltage_b", "type": "number", "scale": 0.01, "unit": "V", "description": "B相电压，原值/100" },
        { "source": "devices[].currB", "target": "current_b", "name": "current_b", "type": "number", "scale": 0.001, "unit": "A", "description": "B相电流，原值/1000" },
        { "source": "devices[].voltC", "target": "voltage_c", "name": "voltage_c", "type": "number", "scale": 0.01, "unit": "V", "description": "C相电压，原值/100" },
        { "source": "devices[].currC", "target": "current_c", "name": "current_c", "type": "number", "scale": 0.001, "unit": "A", "description": "C相电流，原值/1000" }
      ]
    }'::jsonb AS data_parsing_config,
    '{
      "topicTemplates": {
        "control": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB",
        "task": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/taskSet",
        "leakageCheck": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB/LeakageCheck"
      },
      "commands": [
        { "name": "turn_on", "description": "单设备合闸", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "CBControl", "mode": "singleOn", "addr": "{addr}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "turn_off", "description": "单设备分闸", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "CBControl", "mode": "singleOff", "addr": "{addr}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "group_on", "description": "批量合闸", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "CBControl", "mode": "groupOn", "map": "{map}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "group_off", "description": "批量分闸", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "CBControl", "mode": "groupOff", "map": "{map}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "read_status", "description": "获取实时数据", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "GetData", "addr": "{addr}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "reset_energy", "description": "清除电量", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "ResetE", "addr": "{addr}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "reboot_device", "description": "断路器重启", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "Reboot", "addr": "{addr}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "factory_reset", "description": "恢复出厂设置", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "FactorySet", "addr": "{addr}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "maintenance_mode", "description": "进入/退出检修模式", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/CB", "payload": { "packType": "maintenance", "addr": "{addr}", "enable": "{enable}", "ver": "V1.0.5", "id": "{id}" } },
        { "name": "set_timer", "description": "设置定时任务", "topic": "{corp}/json/IoT/GW/V200/{gatewayMac}/down/json/taskSet", "payload": { "packType": "taskSet", "cmd": "set", "counts": "{counts}", "task": "{task}" } }
      ]
    }'::jsonb AS command_config,
    '{
      "required_fields": ["packType"],
      "routing_field": "packType",
      "notes": [
        "CB Topic 复用多种业务，必须按 packType 分流。",
        "CBControl 回应只表示网关接收成功，最终执行结果以 CB/Switch 或 GetData 回读为准。",
        "currentMap、group map、预报警位图位序需现场联调确认。",
        "定时任务 exec=open/close 与分合闸语义需现场确认。"
      ]
    }'::jsonb AS validation_rules,
    '{}'::jsonb AS modbus_config,
    '[]'::jsonb AS modbus_registers,
    true AS is_default,
    'active'::enum_protocol_configs_status AS status,
    'a594401a-2b16-4c0e-9515-adad1b5b80a4'::uuid AS tenant_id,
    'd2b3ee28-053c-4d9e-8f3f-df1cba348d74'::uuid AS created_by
),
updated AS (
  UPDATE protocol_configs pc
  SET
    name = payload.name,
    version = payload.version,
    protocol_type = payload.protocol_type,
    description = payload.description,
    data_parsing_config = payload.data_parsing_config,
    command_config = payload.command_config,
    validation_rules = payload.validation_rules,
    modbus_config = payload.modbus_config,
    modbus_registers = payload.modbus_registers,
    status = payload.status,
    updated_at = CURRENT_TIMESTAMP
  FROM payload
  WHERE pc.tenant_id = payload.tenant_id
    AND pc.manufacturer_code = payload.manufacturer_code
    AND pc.device_type = payload.device_type
    AND pc.is_default = payload.is_default
  RETURNING pc.id
)
INSERT INTO protocol_configs (
  name,
  version,
  protocol_type,
  manufacturer_code,
  device_type,
  description,
  data_parsing_config,
  command_config,
  validation_rules,
  modbus_config,
  modbus_registers,
  is_default,
  status,
  tenant_id,
  created_by,
  created_at,
  updated_at
)
SELECT
  name,
  version,
  protocol_type,
  manufacturer_code,
  device_type,
  description,
  data_parsing_config,
  command_config,
  validation_rules,
  modbus_config,
  modbus_registers,
  is_default,
  status,
  tenant_id,
  created_by,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM payload
WHERE NOT EXISTS (SELECT 1 FROM updated);

COMMIT;
