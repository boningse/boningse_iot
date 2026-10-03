BEGIN;

-- Preserve cumulative readings so seven-day increases use two real readings,
-- not sums of daily estimates. Existing tables and rows are left intact.
CREATE TABLE IF NOT EXISTS thermostat_runtime_history (
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  observed_at TIMESTAMPTZ NOT NULL,
  fan_low_runtime BIGINT,
  fan_middle_runtime BIGINT,
  fan_high_runtime BIGINT,
  heat_low_runtime BIGINT,
  heat_middle_runtime BIGINT,
  heat_high_runtime BIGINT,
  cool_low_runtime BIGINT,
  cool_middle_runtime BIGINT,
  cool_high_runtime BIGINT,
  PRIMARY KEY (device_id, observed_at)
);

-- Seed only known readings, retaining their actual receipt time.
INSERT INTO thermostat_runtime_history (
  device_id, observed_at,
  fan_low_runtime, fan_middle_runtime, fan_high_runtime,
  heat_low_runtime, heat_middle_runtime, heat_high_runtime,
  cool_low_runtime, cool_middle_runtime, cool_high_runtime
)
SELECT device_id, last_received_at,
       fan_low_runtime, fan_middle_runtime, fan_high_runtime,
       heat_low_runtime, heat_middle_runtime, heat_high_runtime,
       cool_low_runtime, cool_middle_runtime, cool_high_runtime
FROM thermostat_runtime_snapshots
WHERE last_received_at IS NOT NULL
ON CONFLICT (device_id, observed_at) DO NOTHING;

COMMIT;
