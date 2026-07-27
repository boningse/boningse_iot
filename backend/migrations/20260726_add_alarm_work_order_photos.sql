BEGIN;

CREATE TABLE IF NOT EXISTS device_alarm_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  alarm_id uuid NOT NULL REFERENCES device_alarms(id) ON DELETE CASCADE,
  action_id uuid REFERENCES device_alarm_actions(id) ON DELETE SET NULL,
  uploaded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  original_name varchar(255) NOT NULL,
  stored_name varchar(160) NOT NULL UNIQUE,
  storage_path varchar(500) NOT NULL,
  mime_type varchar(80) NOT NULL,
  file_size bigint NOT NULL CHECK (file_size > 0),
  checksum_sha256 varchar(64),
  category varchar(24) NOT NULL DEFAULT 'general'
    CHECK (category IN ('before', 'during', 'after', 'general')),
  client_type varchar(24) NOT NULL DEFAULT 'pc'
    CHECK (client_type IN ('pc', 'mini_program', 'other')),
  captured_at timestamptz,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location_text varchar(255),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_alarm_photos_alarm_time
  ON device_alarm_photos (alarm_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alarm_photos_action
  ON device_alarm_photos (action_id);

COMMENT ON TABLE device_alarm_photos IS '告警工单流转中的现场照片附件';

INSERT INTO database_table_lifecycle (
  table_schema, table_name, lifecycle_status, owner_module, reason, display_name
) VALUES (
  'public', 'device_alarm_photos', 'active', 'alarm_management',
  '工单接单、处理和解决环节的多张现场照片', '告警工单照片'
)
ON CONFLICT (table_schema, table_name) DO UPDATE SET
  lifecycle_status = EXCLUDED.lifecycle_status,
  owner_module = EXCLUDED.owner_module,
  reason = EXCLUDED.reason,
  display_name = EXCLUDED.display_name,
  reviewed_at = now();

COMMIT;
