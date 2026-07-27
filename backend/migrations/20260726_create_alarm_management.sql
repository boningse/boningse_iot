BEGIN;

CREATE TABLE IF NOT EXISTS device_alarms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  module_type varchar(32) NOT NULL CHECK (module_type IN ('switch', 'lighting', 'thermostat', 'air_conditioner')),
  alarm_type varchar(64) NOT NULL,
  severity varchar(16) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  title varchar(160) NOT NULL,
  message text,
  alarm_code varchar(128),
  source varchar(32) NOT NULL DEFAULT 'status',
  metric_key varchar(64),
  metric_value double precision,
  threshold_value double precision,
  status varchar(24) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'acknowledged', 'processing', 'resolved', 'closed')),
  dedup_key varchar(320) NOT NULL UNIQUE,
  first_occurred_at timestamptz NOT NULL DEFAULT now(),
  last_occurred_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  processing_note text,
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  resolution text,
  closed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS device_alarm_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alarm_id uuid NOT NULL REFERENCES device_alarms(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  action varchar(32) NOT NULL
    CHECK (action IN ('created', 'acknowledged', 'assigned', 'processing', 'commented', 'resolved', 'closed', 'reopened', 'auto_resolved')),
  from_status varchar(24),
  to_status varchar(24),
  operator_id uuid REFERENCES users(id) ON DELETE SET NULL,
  operator_name varchar(128),
  assigned_to uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_device_alarms_tenant_status_time
  ON device_alarms (tenant_id, status, last_occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alarms_device_module
  ON device_alarms (device_id, module_type, last_occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alarms_module_severity
  ON device_alarms (module_type, severity, last_occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alarm_actions_alarm_time
  ON device_alarm_actions (alarm_id, created_at DESC);

COMMENT ON TABLE device_alarms IS '四类控制设备的去重告警事件及当前处理状态';
COMMENT ON TABLE device_alarm_actions IS '告警确认、派单、处理、解决、关闭和重开操作轨迹';

INSERT INTO database_table_lifecycle (
  table_schema, table_name, lifecycle_status, owner_module, reason, display_name
) VALUES
  ('public', 'device_alarms', 'active', 'alarm_management', '四类控制设备统一告警事件和处理状态', '设备告警事件'),
  ('public', 'device_alarm_actions', 'active', 'alarm_management', '告警全流程操作审计轨迹', '告警处理记录')
ON CONFLICT (table_schema, table_name) DO UPDATE SET
  lifecycle_status = EXCLUDED.lifecycle_status,
  owner_module = EXCLUDED.owner_module,
  reason = EXCLUDED.reason,
  display_name = EXCLUDED.display_name,
  reviewed_at = now();

COMMIT;
