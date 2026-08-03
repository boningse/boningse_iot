BEGIN;

CREATE TABLE IF NOT EXISTS switch_scenes (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  description VARCHAR(200),
  action VARCHAR(10) NOT NULL CHECK (action IN ('on', 'off')),
  device_ids UUID[] NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_switch_scenes_tenant_created
  ON switch_scenes(tenant_id, created_at DESC);

COMMIT;
