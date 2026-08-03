-- 将遥控器权限写入 DA51KD 协议配置；执行端从 command_config 获取寄存器地址。
WITH target AS (
  SELECT id
  FROM protocol_configs
  WHERE manufacturer_code = 'DA51KD'
    AND name = 'DA51KD LTE分散空调控制器'
), updated AS (
  UPDATE protocol_configs pc
  SET modbus_registers = CASE
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(pc.modbus_registers, '[]'::jsonb)) item
          WHERE item->>'address' = '0x2A0A'
        ) THEN pc.modbus_registers
        ELSE COALESCE(pc.modbus_registers, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'name', '红外输出模式', 'address', '0x2A0A', 'access', 'read_write',
          'data_type', 'number', 'register_count', 1, 'scale', 1, 'unit', '',
          'description', '0=介入式运行；1=平行式运行'
        ))
      END,
      command_config = jsonb_set(
        pc.command_config,
        '{commands}',
        COALESCE(pc.command_config->'commands', '[]'::jsonb) || CASE
          WHEN EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(pc.command_config->'commands', '[]'::jsonb)) item
            WHERE item->>'name' = 'set_infrared_output_mode'
          ) THEN '[]'::jsonb
          ELSE jsonb_build_array(jsonb_build_object(
            'name', 'set_infrared_output_mode', 'topic', '', 'topic_source', 'manufacturer',
            'description', '设置遥控器权限', 'action_values', '0=介入式运行；1=平行式运行',
            'payload', jsonb_build_object('data', '{base64_modbus_frame}', 'action', 'infrared_output_mode',
              'registers', jsonb_build_object('0x2A0A', '{infrared_output_mode}'))
          ))
        END
      ),
      updated_at = CURRENT_TIMESTAMP
  FROM target
  WHERE pc.id = target.id
  RETURNING pc.id
)
UPDATE protocol_configs pc
SET command_config = jsonb_set(
      pc.command_config,
      '{visual_config,commands}',
      pc.command_config->'commands',
      true
    ),
    updated_at = CURRENT_TIMESTAMP
FROM updated
WHERE pc.id = updated.id;
