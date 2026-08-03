BEGIN;

ALTER TABLE air_conditioner_schedules
  DROP CONSTRAINT IF EXISTS air_conditioner_schedules_action_check;

ALTER TABLE air_conditioner_schedules
  ADD CONSTRAINT air_conditioner_schedules_action_check
  CHECK (action IN (
    'power_on',
    'power_off',
    'temperature',
    'remote_intervention',
    'remote_parallel'
  ));

COMMIT;
