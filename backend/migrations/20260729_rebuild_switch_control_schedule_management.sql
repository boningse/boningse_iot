BEGIN;

ALTER TABLE switch_control_schedules
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS repeat_type VARCHAR(16) NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS custom_dates DATE[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description VARCHAR(200);

UPDATE switch_control_schedules
SET group_id = gen_random_uuid(),
    repeat_type = CASE
      WHEN cardinality(repeat_days) = 7 THEN 'daily'
      WHEN cardinality(repeat_days) > 0 THEN 'weekly'
      ELSE 'once'
    END
WHERE group_id IS NULL;

ALTER TABLE switch_control_schedules
  ALTER COLUMN group_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'switch_control_schedules_repeat_type_check'
  ) THEN
    ALTER TABLE switch_control_schedules
      ADD CONSTRAINT switch_control_schedules_repeat_type_check
      CHECK (repeat_type IN ('once', 'daily', 'weekly', 'custom'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_switch_control_schedules_group
  ON switch_control_schedules (group_id);

COMMIT;
