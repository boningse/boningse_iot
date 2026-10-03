BEGIN;

-- Change only the polling interval; retain all protocol mappings and runtime data.
UPDATE protocol_configs
SET data_parsing_config = jsonb_set(
      COALESCE(data_parsing_config, '{}'::jsonb),
      '{runtime_poll_interval_minutes}',
      '30'::jsonb,
      true
    ),
    updated_at = NOW()
WHERE id = '73d17555-fed3-413f-88f1-0ece5ed37b23'
  AND name = '温控器'
  AND device_type = '空调温控器';

COMMIT;
