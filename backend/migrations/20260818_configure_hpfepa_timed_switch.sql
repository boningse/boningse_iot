-- HPFEPA ePa_LP timed switch, based on 海普发平台通信协议 V1.9.
-- This update is intentionally scoped to the existing HPFEPA protocol record.
UPDATE protocol_configs
SET version = 'V1.9',
    protocol_type = 'json',
    device_type = '定时开关',
    description = '海普发 ePa_LP 独立式定时开关 MQTT JSON 协议（平台协议 V1.9）',
    data_parsing_config = $json$
{
  "codec": "configured_json",
  "module_type": "switch",
  "transport": "mqtt_json",
  "protocol_version": "V1.9",
  "message_match": {
    "path": "bid",
    "in": [201, 202, 207, 208]
  },
  "record_path": "Children[0]",
  "fields": [
    {"name":"message_type","path":"$.bid","type":"integer","description":"业务ID"},
    {"name":"device_time","path":"$.SysTime","type":"string","description":"设备采集时间"},
    {"name":"client_id","path":"ClientID","type":"string","description":"ePa_LP设备编号"},
    {"name":"power_status","path":"SwitchStatus","type":"boolean","map":{"0":false,"1":true,"2":null,"default":null},"description":"0分闸，1合闸，2上锁"},
    {"name":"lock_status","path":"SwitchStatus","type":"boolean","map":{"0":false,"1":false,"2":true,"default":null},"description":"2表示上锁"},
    {"name":"switch_state_code","path":"SwitchStatus","type":"integer","description":"设备原始开关状态"},
    {"name":"mode","path":"Mode","type":"string","map":{"0":"auto","1":"manual","default":"unknown"},"description":"0自动，1手动"},
    {"name":"communication_status","path":"UsartComm","type":"integer","description":"0正常，1失联，2设备返回故障"},
    {"name":"fault_code","path":"ElectricStatus","type":"integer","description":"32位电气告警状态字"},

    {"name":"voltage","path":"Voltage[0]","type":"number","scale":0.001,"unit":"V"},
    {"name":"voltage_a","path":"Voltage[0]","type":"number","scale":0.001,"unit":"V"},
    {"name":"voltage_b","path":"Voltage[1]","type":"number","scale":0.001,"unit":"V"},
    {"name":"voltage_c","path":"Voltage[2]","type":"number","scale":0.001,"unit":"V"},

    {"name":"current","path":"Current[0]","type":"number","scale":0.001,"unit":"A"},
    {"name":"current_a","path":"Current[0]","type":"number","scale":0.001,"unit":"A"},
    {"name":"current_b","path":"Current[1]","type":"number","scale":0.001,"unit":"A"},
    {"name":"current_c","path":"Current[2]","type":"number","scale":0.001,"unit":"A"},

    {"name":"power","path":"Power[0]","type":"number","scale":1,"unit":"W"},
    {"name":"power_a","path":"Power[0]","type":"number","scale":1,"unit":"W"},
    {"name":"power_b","path":"Power[1]","type":"number","scale":1,"unit":"W"},
    {"name":"power_c","path":"Power[2]","type":"number","scale":1,"unit":"W"},
    {"name":"total_active_power","path":["Power[3]","Power[0]"],"prefer_nonzero":true,"type":"number","scale":1,"unit":"W"},

    {"name":"energy","path":["Energy[3]","Energy[0]"],"prefer_nonzero":true,"type":"number","scale":0.001,"unit":"kWh"},

    {"name":"temperature","path":"Temperature[0]","type":"number","scale":0.01,"unit":"°C"},
    {"name":"temperature_a","path":"Temperature[0]","type":"number","scale":0.01,"unit":"°C"},
    {"name":"temperature_b","path":"Temperature[1]","type":"number","scale":0.01,"unit":"°C"},
    {"name":"temperature_c","path":"Temperature[2]","type":"number","scale":0.01,"unit":"°C"}
  ]
}
$json$::jsonb,
    command_config = $json$
{
  "codec": "configured_json",
  "module_type": "switch",
  "transport": "mqtt_json",
  "protocol_version": "V1.9",
  "qos": 0,
  "topicTemplates": {
    "control": "zhhl/EPA/{deviceId}/subscribe",
    "documented_control": "to/epa/{gatewayId}"
  },
  "commands": [
    {
      "name": "turn_on",
      "description": "合闸",
      "topic": "zhhl/EPA/{deviceId}/subscribe",
      "payload": {"bid":202,"mid":"{mid}","Children":[{"ClientID":"{ClientID}","MoterOperation":1}]}
    },
    {
      "name": "turn_off",
      "description": "分闸",
      "topic": "zhhl/EPA/{deviceId}/subscribe",
      "payload": {"bid":202,"mid":"{mid}","Children":[{"ClientID":"{ClientID}","MoterOperation":2}]}
    },
    {
      "name": "lock",
      "description": "上锁",
      "topic": "zhhl/EPA/{deviceId}/subscribe",
      "payload": {"bid":202,"mid":"{mid}","Children":[{"ClientID":"{ClientID}","MoterOperation":3}]}
    },
    {
      "name": "unlock",
      "description": "解锁",
      "topic": "zhhl/EPA/{deviceId}/subscribe",
      "payload": {"bid":202,"mid":"{mid}","Children":[{"ClientID":"{ClientID}","MoterOperation":4}]}
    },
    {
      "name": "read_status",
      "description": "请求设备实时数据",
      "topic": "zhhl/EPA/{deviceId}/subscribe",
      "payload": {"bid":208,"mid":"{mid}","Children":[{"ClientID":"{ClientID}"}]}
    }
  ],
  "auto_responses": [
    {
      "name": "heartbeat_ack",
      "match": {"path":"bid","equals":101},
      "topic": "zhhl/EPA/{deviceId}/subscribe",
      "payload": {"bid":101}
    }
  ],
  "control_response": {
    "business_id": 202,
    "expected_within_ms": 1500
  }
}
$json$::jsonb,
    validation_rules = '[]'::jsonb,
    status = 'active',
    is_default = true,
    updated_at = CURRENT_TIMESTAMP
WHERE name = 'HPFEPA'
  AND manufacturer_code = 'HPFEPA';
