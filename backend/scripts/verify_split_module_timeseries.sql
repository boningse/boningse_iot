\pset pager off

SELECT hypertable_name, num_chunks
FROM timescaledb_information.hypertables
WHERE hypertable_schema = 'public'
  AND hypertable_name SIMILAR TO
    '(switch|lighting|air_conditioner|thermostat)_(status_measurements|electrical_measurements|control_logs)'
ORDER BY hypertable_name;

SELECT 'switch' AS module,
       (SELECT count(*) FROM switch_status_measurements) AS status_rows,
       (SELECT count(*) FROM switch_electrical_measurements) AS electrical_rows,
       (SELECT count(*) FROM switch_control_logs) AS control_rows
UNION ALL
SELECT 'lighting',
       (SELECT count(*) FROM lighting_status_measurements),
       (SELECT count(*) FROM lighting_electrical_measurements),
       (SELECT count(*) FROM lighting_control_logs)
UNION ALL
SELECT 'air_conditioner',
       (SELECT count(*) FROM air_conditioner_status_measurements),
       (SELECT count(*) FROM air_conditioner_electrical_measurements),
       (SELECT count(*) FROM air_conditioner_control_logs)
UNION ALL
SELECT 'thermostat',
       (SELECT count(*) FROM thermostat_status_measurements),
       (SELECT count(*) FROM thermostat_electrical_measurements),
       (SELECT count(*) FROM thermostat_control_logs)
ORDER BY module;

SELECT table_name, count(*) AS electrical_columns
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name SIMILAR TO
    '(switch|lighting|air_conditioner|thermostat)_electrical_measurements'
GROUP BY table_name
ORDER BY table_name;

SELECT table_name, display_name, lifecycle_status, owner_module
FROM database_table_lifecycle
WHERE table_name SIMILAR TO
  '(switch|lighting|air_conditioner|thermostat)_(status_measurements|electrical_measurements|control_logs)'
   OR table_name LIKE 'legacy_unified_%'
ORDER BY lifecycle_status, table_name;

SELECT count(*) AS split_membership_triggers
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname LIKE 'trg_%_membership'
  AND tgrelid::regclass::text SIMILAR TO
    '(switch|lighting|air_conditioner|thermostat)_(status_measurements|electrical_measurements|control_logs)';
