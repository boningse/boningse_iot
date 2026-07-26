BEGIN;

ALTER TABLE device_alarms
  DROP CONSTRAINT IF EXISTS device_alarms_status_check;

ALTER TABLE device_alarms
  ADD CONSTRAINT device_alarms_status_check
  CHECK (status IN ('active', 'acknowledged', 'assigned', 'processing', 'resolved', 'closed'));

ALTER TABLE device_alarms
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

ALTER TABLE device_alarm_actions
  DROP CONSTRAINT IF EXISTS device_alarm_actions_action_check;

ALTER TABLE device_alarm_actions
  ADD CONSTRAINT device_alarm_actions_action_check
  CHECK (action IN (
    'created', 'acknowledged', 'assigned', 'accepted', 'rejected',
    'processing', 'commented', 'resolved', 'closed', 'reopened', 'auto_resolved'
  ));

CREATE TABLE IF NOT EXISTS user_alarm_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  alarm_id uuid NOT NULL REFERENCES device_alarms(id) ON DELETE CASCADE,
  notification_type varchar(32) NOT NULL DEFAULT 'assignment'
    CHECK (notification_type IN ('assignment', 'reassignment', 'status_update')),
  title varchar(160) NOT NULL,
  message text,
  link varchar(320) NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_alarm_notifications_user_read_time
  ON user_alarm_notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_alarm_notifications_alarm
  ON user_alarm_notifications (alarm_id, created_at DESC);

COMMENT ON TABLE user_alarm_notifications IS '告警派单及处理状态的用户站内消息';

INSERT INTO database_table_lifecycle (
  table_schema, table_name, lifecycle_status, owner_module, reason, display_name
) VALUES (
  'public', 'user_alarm_notifications', 'active', 'alarm_management',
  '告警派单和处理进度的用户站内消息', '告警站内消息'
)
ON CONFLICT (table_schema, table_name) DO UPDATE SET
  lifecycle_status = EXCLUDED.lifecycle_status,
  owner_module = EXCLUDED.owner_module,
  reason = EXCLUDED.reason,
  display_name = EXCLUDED.display_name,
  reviewed_at = now();

COMMIT;
