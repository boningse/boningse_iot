BEGIN;

ALTER TABLE thermostat_properties
  ADD COLUMN IF NOT EXISTS running_fan_speed integer;

COMMENT ON COLUMN thermostat_properties.fan_speed IS
  '设定风速：setFanSpeed，0自动，1一档，2二档，3三档';
COMMENT ON COLUMN thermostat_properties.running_fan_speed IS
  '实际运行风速：runFanSpeed，0自动，1一档，2二档，3三档';

WITH latest_set AS (
  SELECT DISTINCT ON (device_id) device_id, (raw_payload->>'setFanSpeed')::integer AS value
  FROM thermostat_status_measurements
  WHERE measured_at >= NOW() - INTERVAL '24 hours'
    AND raw_payload->>'setFanSpeed' IN ('0','1','2','3')
  ORDER BY device_id, measured_at DESC, id DESC
), latest_run AS (
  SELECT DISTINCT ON (device_id) device_id, (raw_payload->>'runFanSpeed')::integer AS value
  FROM thermostat_status_measurements
  WHERE measured_at >= NOW() - INTERVAL '24 hours'
    AND raw_payload->>'runFanSpeed' IN ('0','1','2','3')
  ORDER BY device_id, measured_at DESC, id DESC
)
UPDATE thermostat_properties tp
SET fan_speed = COALESCE(latest_set.value, tp.fan_speed),
    running_fan_speed = latest_run.value,
    updated_at = NOW()
FROM latest_run
LEFT JOIN latest_set ON latest_set.device_id = latest_run.device_id
WHERE tp.device_id = latest_run.device_id;

COMMIT;
