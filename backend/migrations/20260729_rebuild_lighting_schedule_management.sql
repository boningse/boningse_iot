BEGIN;

ALTER TABLE lighting_device_timers
  ADD COLUMN IF NOT EXISTS group_id UUID,
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS repeat_type VARCHAR(16) NOT NULL DEFAULT 'once',
  ADD COLUMN IF NOT EXISTS repeat_days SMALLINT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS custom_dates DATE[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS description VARCHAR(200),
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE lighting_device_timers timer
SET device_id = device.id::text,
    tenant_id = device.tenant_id
FROM devices device
WHERE timer.device_id IN (device.id::text, device.imei, device.device_id);

UPDATE lighting_device_timers
SET group_id = gen_random_uuid(),
    repeat_days = COALESCE(repeat, '{}')::smallint[],
    repeat_type = CASE
      WHEN cardinality(COALESCE(repeat, '{}')) = 7 THEN 'daily'
      WHEN cardinality(COALESCE(repeat, '{}')) > 0 THEN 'weekly'
      ELSE 'once'
    END
WHERE group_id IS NULL;

ALTER TABLE lighting_device_timers
  ALTER COLUMN group_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'lighting_device_timers_repeat_type_check'
  ) THEN
    ALTER TABLE lighting_device_timers
      ADD CONSTRAINT lighting_device_timers_repeat_type_check
      CHECK (repeat_type IN ('once', 'daily', 'weekly', 'custom'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_lighting_device_timers_group
  ON lighting_device_timers (group_id);
CREATE INDEX IF NOT EXISTS idx_lighting_device_timers_tenant
  ON lighting_device_timers (tenant_id);

COMMIT;
