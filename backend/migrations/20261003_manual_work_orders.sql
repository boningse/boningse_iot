BEGIN;

ALTER TABLE device_alarms ALTER COLUMN device_id DROP NOT NULL;
ALTER TABLE device_alarms DROP CONSTRAINT IF EXISTS device_alarms_module_type_check;
ALTER TABLE device_alarms ADD CONSTRAINT device_alarms_module_type_check
  CHECK (module_type IN ('switch', 'lighting', 'thermostat', 'air_conditioner', 'manual'));
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS work_order_type varchar(32);
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS expected_at timestamptz;
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS location_text varchar(300);
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS department_name varchar(100);
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS project_building_id uuid REFERENCES project_buildings(id) ON DELETE SET NULL;
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS project_group_id uuid REFERENCES project_groups(id) ON DELETE SET NULL;
ALTER TABLE device_alarms ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE device_alarms ADD CONSTRAINT manual_work_order_fields_check
  CHECK (source <> 'manual' OR (work_order_type IS NOT NULL AND created_by IS NOT NULL));

ALTER TABLE device_alarm_actions DROP CONSTRAINT IF EXISTS device_alarm_actions_action_check;
ALTER TABLE device_alarm_actions ADD CONSTRAINT device_alarm_actions_action_check
  CHECK (action IN ('created','acknowledged','assigned','reassigned','accepted','rejected',
    'processing','commented','resolved','closed','reopened','auto_resolved'));

CREATE TABLE IF NOT EXISTS work_order_assignees (
  alarm_id uuid NOT NULL REFERENCES device_alarms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alarm_id, user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS work_order_primary_assignee
  ON work_order_assignees(alarm_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS work_order_assignee_user
  ON work_order_assignees(user_id, assigned_at DESC);

CREATE TABLE IF NOT EXISTS work_order_watchers (
  alarm_id uuid NOT NULL REFERENCES device_alarms(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (alarm_id, user_id)
);

CREATE INDEX IF NOT EXISTS manual_work_order_tenant_time
  ON device_alarms(tenant_id, created_at DESC) WHERE source = 'manual';

INSERT INTO database_table_lifecycle
 (table_schema,table_name,lifecycle_status,owner_module,reason,display_name)
VALUES
 ('public','work_order_assignees','active','alarm_management','手动工单多人处理分配','工单处理人'),
 ('public','work_order_watchers','active','alarm_management','手动工单抄送人员','工单知会人员')
ON CONFLICT (table_schema,table_name) DO UPDATE SET
 lifecycle_status=EXCLUDED.lifecycle_status,
 owner_module=EXCLUDED.owner_module,
 reason=EXCLUDED.reason,
 display_name=EXCLUDED.display_name,
 reviewed_at=now();

COMMIT;
