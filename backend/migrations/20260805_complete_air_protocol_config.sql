-- Complete the air-conditioner protocol so parsing and control are configuration-driven.
UPDATE protocol_configs
SET data_parsing_config = (COALESCE(data_parsing_config, '{}'::jsonb) - 'format') || jsonb_build_object(
      'codec', 'configured_modbus_rtu',
      'module_type', 'air_conditioner',
      'payload_path', 'data',
      'payload_encoding', 'base64',
      'frame', (COALESCE(data_parsing_config->'frame', '{}'::jsonb) || jsonb_build_object(
        'slave_id', 1,
        'function_code', 65,
        'start_register', 256,
        'byte_count', 52,
        'allowed_byte_counts', jsonb_build_array(50, 52),
        'layout', jsonb_build_object(
          'slave_id_offset', 0,
          'function_code_offset', 1,
          'start_register_offset', 2,
          'byte_count_offset', 4,
          'data_offset', 5
        ),
        'crc', jsonb_build_object(
          'algorithm', 'modbus_crc16',
          'bytes', 2,
          'byte_order', 'little'
        )
      ))
    ),
    command_config = jsonb_build_object(
      'name', '配置驱动空调控制命令',
      'codec', 'configured_modbus_rtu',
      'module_type', 'air_conditioner',
      'transport', 'mqtt_json',
      'json_payload_path', 'data',
      'frame_builder', jsonb_build_object(
        'frame_type', 'modbus_write_multiple_registers',
        'slave_id', 1,
        'function_code', 16,
        'byte_order', 'big',
        'output', 'base64',
        'crc', jsonb_build_object(
          'algorithm', 'modbus_crc16',
          'bytes', 2,
          'byte_order', 'little'
        ),
        'response', jsonb_build_object(
          'length', 8,
          'function_code_offset', 1,
          'start_register_offset', 2,
          'register_count_offset', 4
        )
      ),
      'parameters', jsonb_build_object(
        'power_state', jsonb_build_object(
          'command_field', 'power_state',
          'state_field', 'power_status',
          'state_output_field', 'power_status',
          'state_output_type', 'boolean',
          'default', 0,
          'values', jsonb_build_object(
            '0', 0, '1', 1, 'false', 0, 'true', 1,
            'off', 0, 'on', 1, '关', 0, '开', 1, '关闭', 0, '开启', 1
          )
        ),
        'mode', jsonb_build_object(
          'command_field', 'mode',
          'state_field', 'mode',
          'state_output_field', 'mode',
          'default', 'cool',
          'values', jsonb_build_object(
            '1', 1, '2', 2, '3', 3, '4', 4, '5', 5,
            'auto', 1, 'cool', 2, 'heat', 3, 'fan', 4,
            'dehumidify', 5, 'dry', 5,
            '自动', 1, '制冷', 2, '制热', 3, '送风', 4, '除湿', 5
          )
        ),
        'target_temperature', jsonb_build_object(
          'command_field', 'target_temperature',
          'state_field', 'target_temperature',
          'state_output_field', 'target_temperature',
          'default', 24,
          'min', 16,
          'max', 30,
          'multiplier', 10
        ),
        'fan_speed', jsonb_build_object(
          'command_field', 'fan_speed',
          'state_field', 'fan_speed',
          'state_output_field', 'fan_speed',
          'default', 'auto',
          'values', jsonb_build_object(
            '0', 0, '1', 1, '2', 2, '3', 3,
            'auto', 0, 'low', 1, 'medium', 2, 'high', 3,
            '自动', 0, '低', 1, '中', 2, '高', 3,
            '低速', 1, '中速', 2, '高速', 3
          )
        ),
        'infrared_output_mode', jsonb_build_object(
          'command_field', 'infrared_output_mode',
          'state_field', 'infrared_output_mode',
          'state_output_field', 'infrared_output_mode',
          'default', 'intervention',
          'values', jsonb_build_object(
            '0', 0, '1', 1,
            'intervention', 0, 'parallel', 1,
            'remote_intervention', 0, 'remote_parallel', 1,
            '介入式', 0, '介入式运行', 0, '平行式', 1, '平行式运行', 1
          )
        )
      ),
      'commands', jsonb_build_array(
        jsonb_build_object(
          'name', 'set_power',
          'description', '开关机',
          'payload', jsonb_build_object('registers', jsonb_build_object('0x0108', '{power_state}'))
        ),
        jsonb_build_object(
          'name', 'set_mode',
          'description', '设置运行模式',
          'payload', jsonb_build_object('registers', jsonb_build_object('0x0109', '{mode}'))
        ),
        jsonb_build_object(
          'name', 'set_temperature',
          'description', '设置温度',
          'payload', jsonb_build_object('registers', jsonb_build_object('0x010A', '{target_temperature}'))
        ),
        jsonb_build_object(
          'name', 'set_fan_speed',
          'description', '设置风速',
          'payload', jsonb_build_object('registers', jsonb_build_object('0x010B', '{fan_speed}'))
        ),
        jsonb_build_object(
          'name', 'set_operating_state',
          'description', '一次设置开关、模式、温度和风速',
          'aggregate', true,
          'payload', jsonb_build_object('registers', jsonb_build_object(
            '0x0108', '{power_state}',
            '0x0109', '{mode}',
            '0x010A', '{target_temperature}',
            '0x010B', '{fan_speed}'
          ))
        ),
        jsonb_build_object(
          'name', 'set_infrared_output_mode',
          'description', '设置红外输出权限模式',
          'payload', jsonb_build_object('registers', jsonb_build_object('0x2A0A', '{infrared_output_mode}'))
        )
      )
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE manufacturer_code = 'DA51KD'
  AND name = 'DA51KD LTE分散空调控制器';
