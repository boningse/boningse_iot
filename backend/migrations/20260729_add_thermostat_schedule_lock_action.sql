BEGIN;

ALTER TABLE thermostat_schedules
  ADD COLUMN IF NOT EXISTS lock_action VARCHAR(10) NOT NULL DEFAULT 'none';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'thermostat_schedules_lock_action_check'
  ) THEN
    ALTER TABLE thermostat_schedules
      ADD CONSTRAINT thermostat_schedules_lock_action_check
      CHECK (lock_action IN ('lock', 'unlock', 'none'));
  END IF;
END
$$;

COMMIT;
