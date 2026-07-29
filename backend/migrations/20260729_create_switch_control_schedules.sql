BEGIN;

CREATE TABLE IF NOT EXISTS switch_control_schedules (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  action VARCHAR(10) NOT NULL CHECK (action IN ('on', 'off')),
  execute_time TIME NOT NULL,
  repeat_days SMALLINT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  last_executed_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_switch_control_schedules_tenant
  ON switch_control_schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_switch_control_schedules_device
  ON switch_control_schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_switch_control_schedules_due
  ON switch_control_schedules(enabled, execute_time);

CREATE TABLE IF NOT EXISTS switch_control_schedule_logs (
  id BIGSERIAL PRIMARY KEY,
  schedule_id BIGINT NOT NULL REFERENCES switch_control_schedules(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL,
  error_message TEXT,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_switch_control_schedule_logs_schedule
  ON switch_control_schedule_logs(schedule_id, executed_at DESC);

COMMIT;
