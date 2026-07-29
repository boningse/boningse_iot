CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS air_conditioner_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mode VARCHAR(24) NOT NULL DEFAULT 'cool',
  fan_speed VARCHAR(24) NOT NULL DEFAULT 'auto',
  target_temperature NUMERIC(4, 1) NOT NULL DEFAULT 24,
  min_temperature NUMERIC(4, 1) NOT NULL DEFAULT 16,
  max_temperature NUMERIC(4, 1) NOT NULL DEFAULT 30,
  active_start TIME,
  active_end TIME,
  description VARCHAR(200),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (device_id)
);

CREATE INDEX IF NOT EXISTS idx_air_conditioner_strategies_tenant
  ON air_conditioner_strategies (tenant_id, enabled);

CREATE TABLE IF NOT EXISTS air_conditioner_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES air_conditioner_strategies(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  action VARCHAR(24) NOT NULL CHECK (action IN ('power_on', 'power_off', 'temperature')),
  execute_time TIME NOT NULL,
  repeat_days SMALLINT[] NOT NULL DEFAULT '{}',
  mode VARCHAR(24),
  fan_speed VARCHAR(24),
  target_temperature NUMERIC(4, 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_air_conditioner_schedules_due
  ON air_conditioner_schedules (enabled, execute_time);
CREATE INDEX IF NOT EXISTS idx_air_conditioner_schedules_device
  ON air_conditioner_schedules (device_id);

CREATE TABLE IF NOT EXISTS air_conditioner_schedule_logs (
  id BIGSERIAL PRIMARY KEY,
  schedule_id UUID REFERENCES air_conditioner_schedules(id) ON DELETE SET NULL,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO air_conditioner_strategies (
  tenant_id, device_id, enabled, mode, fan_speed, target_temperature,
  min_temperature, max_temperature, active_start, active_end, description
)
SELECT
  assignment.tenant_id,
  assignment.device_id,
  COALESCE((assignment.config->'strategy_config'->>'enabled')::boolean, TRUE),
  COALESCE(assignment.config->'strategy_config'->>'mode', 'cool'),
  COALESCE(assignment.config->'strategy_config'->>'fan_speed', 'auto'),
  COALESCE(NULLIF(assignment.config->'strategy_config'->>'target_temperature', '')::numeric, 24),
  COALESCE(NULLIF(assignment.config#>>'{strategy_config,temperature_range,min}', '')::numeric, 16),
  COALESCE(NULLIF(assignment.config#>>'{strategy_config,temperature_range,max}', '')::numeric, 30),
  NULLIF(assignment.config#>>'{strategy_config,active_period,start}', '')::time,
  NULLIF(assignment.config#>>'{strategy_config,active_period,end}', '')::time,
  assignment.config->'strategy_config'->>'description'
FROM control_device_assignments assignment
WHERE assignment.module_type = 'air_conditioner'
  AND assignment.config ? 'strategy_config'
ON CONFLICT (device_id) DO NOTHING;

INSERT INTO air_conditioner_schedules (
  strategy_id, device_id, name, action, execute_time, repeat_days,
  mode, fan_speed, target_temperature, enabled
)
SELECT
  strategy.id,
  strategy.device_id,
  COALESCE(item->>'name', '空调定时策略'),
  item->>'action',
  (item->>'time')::time,
  COALESCE((
    SELECT array_agg(day::smallint)
    FROM jsonb_array_elements_text(COALESCE(item->'repeat', '[]'::jsonb)) value(day)
  ), '{}'),
  item->>'mode',
  item->>'fan_speed',
  NULLIF(COALESCE(item->>'target_temperature', item->>'targetTemp'), '')::numeric,
  COALESCE((item->>'enabled')::boolean, TRUE)
FROM control_device_assignments assignment
JOIN air_conditioner_strategies strategy ON strategy.device_id = assignment.device_id
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(assignment.config->'strategy_config'->'schedules', '[]'::jsonb)
) item
WHERE assignment.module_type = 'air_conditioner'
  AND item->>'action' IN ('power_on', 'power_off', 'temperature')
  AND NULLIF(item->>'time', '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM air_conditioner_schedules existing
    WHERE existing.strategy_id = strategy.id
  );

UPDATE control_device_assignments
SET config = COALESCE(config, '{}'::jsonb) - 'strategy_config',
    updated_at = CURRENT_TIMESTAMP
WHERE module_type = 'air_conditioner'
  AND config ? 'strategy_config';
