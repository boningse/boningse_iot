BEGIN;

DROP TABLE IF EXISTS legacy_unified_device_control_logs;
DROP TABLE IF EXISTS legacy_unified_device_status_measurements;
DROP TABLE IF EXISTS legacy_unified_electrical_measurements;
DROP TABLE IF EXISTS lighting_groups;
DROP TABLE IF EXISTS thermostat_schedules_backup;

UPDATE database_table_lifecycle
SET lifecycle_status = 'dropped',
    reason = reason || '；2026-07-17确认当前业务不再使用，结构和原数据已备份后删除',
    reviewed_at = NOW()
WHERE table_schema = 'public'
  AND table_name IN (
    'legacy_unified_device_control_logs',
    'legacy_unified_device_status_measurements',
    'legacy_unified_electrical_measurements',
    'lighting_groups',
    'thermostat_schedules_backup'
  );

COMMIT;
