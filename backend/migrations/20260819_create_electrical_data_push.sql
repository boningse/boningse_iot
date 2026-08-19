CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS electrical_push_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL UNIQUE REFERENCES devices(id) ON DELETE CASCADE,
  project_code varchar(100) NOT NULL,
  external_device_code varchar(100) NOT NULL,
  insname varchar(100) NOT NULL DEFAULT '1001',
  propertyno varchar(100) NOT NULL DEFAULT '0',
  metric_fields jsonb NOT NULL DEFAULT '["energy"]'::jsonb,
  interval_minutes integer NOT NULL DEFAULT 5 CHECK (interval_minutes BETWEEN 1 AND 1440),
  enabled boolean NOT NULL DEFAULT true,
  last_pushed_measurement_at timestamptz,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_electrical_push_configs_due
  ON electrical_push_configs(enabled, last_attempt_at);
CREATE INDEX IF NOT EXISTS idx_electrical_push_configs_tenant
  ON electrical_push_configs(tenant_id);

CREATE TABLE IF NOT EXISTS electrical_push_logs (
  id bigserial PRIMARY KEY,
  config_id uuid REFERENCES electrical_push_configs(id) ON DELETE SET NULL,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  measurement_at timestamptz,
  status varchar(20) NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  http_status integer,
  request_payload jsonb,
  response_body text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_electrical_push_logs_config_time
  ON electrical_push_logs(config_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_electrical_push_logs_tenant_time
  ON electrical_push_logs(tenant_id, created_at DESC);
