-- ============================================
-- Migration 004: Add control type flags to devices
-- Date: 2026-07-10
-- Purpose: Add is_thermostat, is_lighting, is_switch, 
--          is_air_conditioner flags to devices table
-- ============================================

-- Add columns
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_thermostat boolean DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_lighting boolean DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_switch boolean DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_air_conditioner boolean DEFAULT false;

UPDATE devices SET
  is_thermostat = COALESCE(is_thermostat, false),
  is_lighting = COALESCE(is_lighting, false),
  is_switch = COALESCE(is_switch, false),
  is_air_conditioner = COALESCE(is_air_conditioner, false);

ALTER TABLE devices ALTER COLUMN is_thermostat SET NOT NULL;
ALTER TABLE devices ALTER COLUMN is_lighting SET NOT NULL;
ALTER TABLE devices ALTER COLUMN is_switch SET NOT NULL;
ALTER TABLE devices ALTER COLUMN is_air_conditioner SET NOT NULL;

-- Mark existing devices
UPDATE devices d SET is_thermostat = true
FROM thermostat_properties tp WHERE d.id = tp.device_id;

UPDATE devices d SET is_lighting = true
FROM lighting_control lc WHERE d.id = lc.device_id AND lc.is_active = true;

UPDATE devices d SET is_switch = true
FROM switch_control sc WHERE d.id = sc.device_id AND sc.is_active = true;

UPDATE devices d SET is_air_conditioner = true
FROM air_conditioner_control acc WHERE d.id = acc.device_id AND acc.is_active = true;

-- Gateways are communication carriers and must never be control targets.
UPDATE devices SET
  is_thermostat = false,
  is_lighting = false,
  is_switch = false,
  is_air_conditioner = false
WHERE device_category = 'gateway';

UPDATE lighting_control lc SET is_active = false, updated_at = CURRENT_TIMESTAMP
FROM devices d WHERE lc.device_id = d.id AND d.device_category = 'gateway' AND lc.is_active = true;

UPDATE switch_control sc SET is_active = false, updated_at = CURRENT_TIMESTAMP
FROM devices d WHERE sc.device_id = d.id AND d.device_category = 'gateway' AND sc.is_active = true;

UPDATE air_conditioner_control acc SET is_active = false, updated_at = CURRENT_TIMESTAMP
FROM devices d WHERE acc.device_id = d.id AND d.device_category = 'gateway' AND acc.is_active = true;

CREATE INDEX IF NOT EXISTS idx_devices_is_thermostat ON devices(is_thermostat) WHERE is_thermostat = true;
CREATE INDEX IF NOT EXISTS idx_devices_is_lighting ON devices(is_lighting) WHERE is_lighting = true;
CREATE INDEX IF NOT EXISTS idx_devices_is_switch ON devices(is_switch) WHERE is_switch = true;
CREATE INDEX IF NOT EXISTS idx_devices_is_air_conditioner ON devices(is_air_conditioner) WHERE is_air_conditioner = true;

CREATE OR REPLACE FUNCTION enforce_gateway_control_flags()
RETURNS trigger AS $$
BEGIN
  IF NEW.device_category = 'gateway' THEN
    NEW.is_thermostat := false;
    NEW.is_lighting := false;
    NEW.is_switch := false;
    NEW.is_air_conditioner := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_devices_gateway_control_flags ON devices;
CREATE TRIGGER trg_devices_gateway_control_flags
BEFORE INSERT OR UPDATE OF device_category, is_thermostat, is_lighting, is_switch, is_air_conditioner
ON devices FOR EACH ROW EXECUTE FUNCTION enforce_gateway_control_flags();

CREATE OR REPLACE FUNCTION sync_device_control_flag()
RETURNS trigger AS $$
DECLARE
  flag_name text := TG_ARGV[0];
  is_gateway boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    EXECUTE format('UPDATE devices SET %I = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', flag_name)
      USING OLD.device_id;
    RETURN OLD;
  END IF;

  SELECT device_category = 'gateway' INTO is_gateway FROM devices WHERE id = NEW.device_id;
  IF COALESCE(NEW.is_active, false) AND COALESCE(is_gateway, false) THEN
    RAISE EXCEPTION '网关设备不能加入控制管理';
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.device_id IS DISTINCT FROM NEW.device_id THEN
    EXECUTE format('UPDATE devices SET %I = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1', flag_name)
      USING OLD.device_id;
  END IF;

  EXECUTE format('UPDATE devices SET %I = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', flag_name)
    USING COALESCE(NEW.is_active, false), NEW.device_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_lighting_control_device_flag ON lighting_control;
CREATE TRIGGER trg_lighting_control_device_flag
AFTER INSERT OR UPDATE OF device_id, is_active OR DELETE ON lighting_control
FOR EACH ROW EXECUTE FUNCTION sync_device_control_flag('is_lighting');

DROP TRIGGER IF EXISTS trg_switch_control_device_flag ON switch_control;
CREATE TRIGGER trg_switch_control_device_flag
AFTER INSERT OR UPDATE OF device_id, is_active OR DELETE ON switch_control
FOR EACH ROW EXECUTE FUNCTION sync_device_control_flag('is_switch');

DROP TRIGGER IF EXISTS trg_air_conditioner_control_device_flag ON air_conditioner_control;
CREATE TRIGGER trg_air_conditioner_control_device_flag
AFTER INSERT OR UPDATE OF device_id, is_active OR DELETE ON air_conditioner_control
FOR EACH ROW EXECUTE FUNCTION sync_device_control_flag('is_air_conditioner');

-- Verify
SELECT 'is_thermostat' as flag, is_thermostat as val, count(*) as cnt
FROM devices GROUP BY is_thermostat
UNION ALL
SELECT 'is_lighting', is_lighting, count(*) FROM devices GROUP BY is_lighting
UNION ALL
SELECT 'is_switch', is_switch, count(*) FROM devices GROUP BY is_switch
UNION ALL
SELECT 'is_air_conditioner', is_air_conditioner, count(*) FROM devices GROUP BY is_air_conditioner
ORDER BY flag, val;
