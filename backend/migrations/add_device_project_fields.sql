ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS project_building_id UUID REFERENCES project_buildings(id),
  ADD COLUMN IF NOT EXISTS project_group_id UUID REFERENCES project_groups(id);

CREATE INDEX IF NOT EXISTS idx_devices_project_building_id ON devices(project_building_id);
CREATE INDEX IF NOT EXISTS idx_devices_project_group_id ON devices(project_group_id);
