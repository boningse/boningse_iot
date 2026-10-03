BEGIN;

-- Store daily deltas separately for each protocol mode and fan speed.
ALTER TABLE thermostat_runtime_stats
  ADD COLUMN IF NOT EXISTS fan_low_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fan_middle_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fan_high_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heat_low_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heat_middle_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS heat_high_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cool_low_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cool_middle_runtime BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cool_high_runtime BIGINT NOT NULL DEFAULT 0;

-- The device reports cumulative counters. Keep the last sample as the baseline
-- so daily statistics can be built from deltas, including counters that reset.
CREATE TABLE IF NOT EXISTS thermostat_runtime_snapshots (
  device_id UUID PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
  fan_low_runtime BIGINT,
  fan_middle_runtime BIGINT,
  fan_high_runtime BIGINT,
  heat_low_runtime BIGINT,
  heat_middle_runtime BIGINT,
  heat_high_runtime BIGINT,
  cool_low_runtime BIGINT,
  cool_middle_runtime BIGINT,
  cool_high_runtime BIGINT,
  last_requested_at TIMESTAMPTZ,
  last_received_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thermostat_runtime_snapshots_received
  ON thermostat_runtime_snapshots(last_received_at);

-- Upgrade only the existing 4G thermostat protocol; other vendors remain untouched.
UPDATE protocol_configs pc
SET version = '5.60',
    data_parsing_config = COALESCE(pc.data_parsing_config, '{}'::jsonb) || jsonb_build_object(
      'version', '5.60',
      'document_version', '5.60',
      'runtime_poll_interval_minutes', 30,
      'description', '4G温控器 JSON 协议解析配置（Version 5.60）',
      'time_mapping', COALESCE(pc.data_parsing_config->'time_mapping', '{}'::jsonb) || jsonb_build_object(
        'FanLow', COALESCE(pc.data_parsing_config #> '{time_mapping,FanLow}', '{}'::jsonb) || '{"mode":"fan","speed":"low"}'::jsonb,
        'FanMiddle', COALESCE(pc.data_parsing_config #> '{time_mapping,FanMiddle}', '{}'::jsonb) || '{"mode":"fan","speed":"middle"}'::jsonb,
        'FanHigh', COALESCE(pc.data_parsing_config #> '{time_mapping,FanHigh}', '{}'::jsonb) || '{"mode":"fan","speed":"high"}'::jsonb,
        'HeatLow', COALESCE(pc.data_parsing_config #> '{time_mapping,HeatLow}', '{}'::jsonb) || '{"mode":"heat","speed":"low"}'::jsonb,
        'HeatMiddle', COALESCE(pc.data_parsing_config #> '{time_mapping,HeatMiddle}', '{}'::jsonb) || '{"mode":"heat","speed":"middle"}'::jsonb,
        'HeatHigh', COALESCE(pc.data_parsing_config #> '{time_mapping,HeatHigh}', '{}'::jsonb) || '{"mode":"heat","speed":"high"}'::jsonb,
        'CoolLow', COALESCE(pc.data_parsing_config #> '{time_mapping,CoolLow}', '{}'::jsonb) || '{"mode":"cool","speed":"low"}'::jsonb,
        'CoolMiddle', COALESCE(pc.data_parsing_config #> '{time_mapping,CoolMiddle}', '{}'::jsonb) || '{"mode":"cool","speed":"middle"}'::jsonb,
        'CoolHigh', COALESCE(pc.data_parsing_config #> '{time_mapping,CoolHigh}', '{}'::jsonb) || '{"mode":"cool","speed":"high"}'::jsonb
      )
    ),
    command_config = jsonb_set(
      COALESCE(pc.command_config, '{}'::jsonb) || jsonb_build_object('version', '5.60'),
      '{command_config}',
      COALESCE(pc.command_config->'command_config', '{}'::jsonb) || jsonb_build_object(
        'commands', COALESCE(pc.command_config #> '{command_config,commands}', pc.command_config->'commands', '{}'::jsonb)
          || jsonb_build_object(
          'read_runtime_time', jsonb_build_object(
            'name', '读取三模式三风速累计运行时间',
            'template', jsonb_build_object(
              'uuid', '{device_id}',
              'pType', 'time',
              'func', 'read',
              'body', jsonb_build_object(
                'id', jsonb_build_array(),
                'items', jsonb_build_array()
              )
            ),
            'description', '按协议 5.60 time/read 空数组格式读取全部内机、全部模式风速累计秒数'
          )
        )
      ),
      true
    ),
    updated_at = NOW()
WHERE pc.id = '73d17555-fed3-413f-88f1-0ece5ed37b23'
  AND pc.name = '温控器'
  AND pc.device_type = '空调温控器';

COMMIT;
