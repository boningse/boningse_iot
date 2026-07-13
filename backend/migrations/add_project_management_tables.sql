CREATE TABLE IF NOT EXISTS project_buildings (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(60),
  address VARCHAR(255),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_buildings_tenant_id ON project_buildings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_buildings_is_active ON project_buildings(is_active);

CREATE TABLE IF NOT EXISTS project_groups (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  building_id UUID REFERENCES project_buildings(id),
  name VARCHAR(100) NOT NULL,
  code VARCHAR(60),
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_project_groups_tenant_id ON project_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_building_id ON project_groups(building_id);
CREATE INDEX IF NOT EXISTS idx_project_groups_is_active ON project_groups(is_active);
