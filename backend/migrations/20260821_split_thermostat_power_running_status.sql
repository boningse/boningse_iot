BEGIN;

ALTER TABLE thermostat_properties
  ADD COLUMN IF NOT EXISTS running_status boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN thermostat_properties.power_status IS
  '温控器开关机设置状态：setOn=1 开机，setOn=0 关机';
COMMENT ON COLUMN thermostat_properties.running_status IS
  '温控器实际运行状态：runOn=1/17 运行，runOn=0/16 待机';

UPDATE thermostat_properties
SET running_status = COALESCE(power_status, false)
WHERE running_status IS DISTINCT FROM COALESCE(power_status, false);

-- 旧版本曾用 runOn 覆盖 power_status；有明确开关机记录的设备按最近一次控制恢复。
WITH latest_power_action AS (
  SELECT DISTINCT ON (device_id)
    device_id,
    action
  FROM thermostat_control_logs
  WHERE action IN ('power_on', 'power_off')
  ORDER BY device_id, created_at DESC
)
UPDATE thermostat_properties tp
SET power_status = latest.action = 'power_on'
FROM latest_power_action latest
WHERE tp.device_id = latest.device_id;

ALTER TABLE thermostat_status_measurements
  ADD COLUMN IF NOT EXISTS running_status boolean;

COMMENT ON COLUMN thermostat_status_measurements.running_status IS
  '温控器实际运行状态，来源于 runOn，兼容 0/1 和 16/17';

CREATE INDEX IF NOT EXISTS idx_thermostat_properties_running_status
  ON thermostat_properties (running_status);

COMMIT;
