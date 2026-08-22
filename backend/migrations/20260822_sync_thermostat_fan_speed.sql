BEGIN;

-- 使用最近一次设备实际上报修正当前风速：0自动、1一档、2二档、3三档。
WITH latest_fan_speed AS (
  SELECT DISTINCT ON (device_id)
    device_id,
    (raw_payload->>'runFanSpeed')::integer AS fan_speed
  FROM thermostat_status_measurements
  WHERE measured_at >= NOW() - INTERVAL '24 hours'
    AND raw_payload->>'runFanSpeed' IN ('0', '1', '2', '3')
  ORDER BY device_id, measured_at DESC, id DESC
)
UPDATE thermostat_properties tp
SET fan_speed = latest.fan_speed,
    updated_at = NOW()
FROM latest_fan_speed latest
WHERE tp.device_id = latest.device_id
  AND tp.fan_speed IS DISTINCT FROM latest.fan_speed;

COMMIT;
