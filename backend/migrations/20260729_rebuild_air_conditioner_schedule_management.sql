BEGIN;

ALTER TABLE air_conditioner_schedules
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS repeat_type VARCHAR(16) NOT NULL DEFAULT 'daily',
  ADD COLUMN IF NOT EXISTS custom_dates DATE[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description VARCHAR(200),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL;

UPDATE air_conditioner_schedules
SET group_id = id,
    repeat_type = CASE
      WHEN cardinality(repeat_days) = 7 THEN 'daily'
      WHEN cardinality(repeat_days) > 0 THEN 'weekly'
      ELSE 'daily'
    END
WHERE group_id IS NULL;

ALTER TABLE air_conditioner_schedules
  ALTER COLUMN group_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'air_conditioner_schedules_repeat_type_check'
  ) THEN
    ALTER TABLE air_conditioner_schedules
      ADD CONSTRAINT air_conditioner_schedules_repeat_type_check
      CHECK (repeat_type IN ('once', 'daily', 'weekly', 'custom'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_air_conditioner_schedules_group
  ON air_conditioner_schedules (group_id);

COMMIT;
