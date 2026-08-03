BEGIN;

ALTER TABLE air_conditioner_schedules
  ADD COLUMN IF NOT EXISTS remote_permission_mode VARCHAR(16);

UPDATE air_conditioner_schedules
SET remote_permission_mode = CASE action
  WHEN 'remote_intervention' THEN 'intervention'
  WHEN 'remote_parallel' THEN 'parallel'
  ELSE remote_permission_mode
END,
    action = CASE
      WHEN action IN ('remote_intervention', 'remote_parallel') THEN 'none'
      ELSE action
    END;

ALTER TABLE air_conditioner_schedules
  DROP CONSTRAINT IF EXISTS air_conditioner_schedules_action_check;

ALTER TABLE air_conditioner_schedules
  ADD CONSTRAINT air_conditioner_schedules_action_check
  CHECK (action IN ('none', 'power_on', 'power_off', 'temperature'));

ALTER TABLE air_conditioner_schedules
  DROP CONSTRAINT IF EXISTS air_conditioner_schedules_remote_permission_mode_check;

ALTER TABLE air_conditioner_schedules
  ADD CONSTRAINT air_conditioner_schedules_remote_permission_mode_check
  CHECK (remote_permission_mode IS NULL OR remote_permission_mode IN ('intervention', 'parallel'));

COMMIT;
