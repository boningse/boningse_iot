BEGIN;

DROP TABLE IF EXISTS switch_status_data CASCADE;
DROP TABLE IF EXISTS switch_electrical_data CASCADE;
DROP TABLE IF EXISTS air_conditioner_status_data CASCADE;
DROP TABLE IF EXISTS air_conditioner_electrical_data CASCADE;
DROP TABLE IF EXISTS lighting_switch_bndk CASCADE;
DROP TABLE IF EXISTS lighting_electrical_bndk_252000 CASCADE;
DROP TABLE IF EXISTS lighting_electrical_bndk_370282 CASCADE;
DROP TABLE IF EXISTS thermostat_control_logs CASCADE;

DROP TABLE IF EXISTS switch_control CASCADE;
DROP TABLE IF EXISTS lighting_control CASCADE;
DROP TABLE IF EXISTS air_conditioner_control CASCADE;

DO $$
DECLARE
  function_signature text;
BEGIN
  FOR function_signature IN
    SELECT p.oid::regprocedure::text
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'cleanup_old_monthly_lighting_electrical_data',
        'cleanup_tenant_lighting_electrical_data',
        'create_lighting_data_table',
        'ensure_tenant_lighting_electrical_tables',
        'get_latest_lighting_data',
        'get_latest_lighting_electrical_data',
        'get_latest_lighting_switch_data',
        'get_latest_monthly_lighting_electrical_data',
        'get_latest_tenant_lighting_electrical_data',
        'get_lighting_data',
        'get_lighting_electrical_data',
        'get_lighting_switch_data',
        'get_monthly_lighting_electrical_data',
        'get_tenant_lighting_electrical_table_name',
        'insert_lighting_data',
        'insert_lighting_electrical_data',
        'insert_lighting_switch_data',
        'insert_monthly_lighting_electrical_data',
        'insert_tenant_lighting_electrical_data'
      ])
  LOOP
    EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE', function_signature);
  END LOOP;
END
$$;

COMMIT;
