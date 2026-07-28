BEGIN;

DROP VIEW IF EXISTS switch_latest_status;

ALTER TABLE switch_status_measurements
  ADD COLUMN IF NOT EXISTS power_status boolean;

UPDATE switch_status_measurements
SET power_status = COALESCE(
  power_status,
  CASE lower(COALESCE(state->>'power_status', state->>'power_state'))
    WHEN 'true' THEN true
    WHEN '1' THEN true
    WHEN 'false' THEN false
    WHEN '0' THEN false
    ELSE NULL
  END
)
WHERE power_status IS NULL;

ALTER TABLE switch_status_measurements
  DROP COLUMN IF EXISTS switch_1,
  DROP COLUMN IF EXISTS switch_2,
  DROP COLUMN IF EXISTS switch_3;

CREATE VIEW switch_latest_status AS
SELECT DISTINCT ON (device_id) *
FROM switch_status_measurements
ORDER BY device_id, measured_at DESC, id DESC;

COMMENT ON COLUMN switch_status_measurements.power_status IS
  '开关控制模块的单路开关状态，true 为开启，false 为关闭';

COMMIT;
