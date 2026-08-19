ALTER TABLE electrical_push_configs
  ADD COLUMN IF NOT EXISTS data_source varchar(30) NOT NULL DEFAULT 'switch';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'electrical_push_configs_data_source_check'
  ) THEN
    ALTER TABLE electrical_push_configs
      ADD CONSTRAINT electrical_push_configs_data_source_check
      CHECK (data_source IN ('switch', 'lighting', 'thermostat', 'air_conditioner'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_electrical_push_configs_source
  ON electrical_push_configs(data_source, enabled);
