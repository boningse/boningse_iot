BEGIN;

-- The thermostat protocol declares how a gateway batch response maps each
-- body.id entry to the corresponding body.data row and child device identity.
UPDATE protocol_configs
SET data_parsing_config = jsonb_set(
  COALESCE(data_parsing_config, '{}'::jsonb),
  '{subdevice_routing}',
  '{
    "enabled": true,
    "id_path": "body.id",
    "rows_path": "body.data",
    "items_path": "body.items",
    "identity_template": "{gateway_imei}-{subdevice_id}"
  }'::jsonb,
  true
),
updated_at = NOW()
WHERE id = '73d17555-fed3-413f-88f1-0ece5ed37b23';

-- Keep the target set stable while device_id values are re-keyed. A temporary
-- value is necessary because device_id is globally unique and some final
-- values are currently held by another row in this same target set.
CREATE TEMP TABLE thermostat_subdevice_rekey ON COMMIT DROP AS
SELECT
  d.id,
  p.imei || '-' || d.sub_device_sequence::text AS new_identity
FROM devices d
JOIN devices p ON p.id = d.parent_device_id
WHERE d.tenant_id = '7d3e872e-b20b-4508-b8f3-c168c0592ef3'
  AND d.parent_device_id IS NOT NULL
  AND d.is_thermostat = true
  AND d.protocol_config_id = '73d17555-fed3-413f-88f1-0ece5ed37b23'
  AND p.imei IS NOT NULL
  AND d.sub_device_sequence IS NOT NULL;

UPDATE devices d
SET device_id = '__thermostat_rekey__' || d.id::text,
    imei = '__thermostat_rekey__' || d.id::text,
    updated_at = NOW()
FROM thermostat_subdevice_rekey target
WHERE d.id = target.id;

UPDATE devices d
SET device_id = target.new_identity,
    imei = target.new_identity,
    updated_at = NOW()
FROM thermostat_subdevice_rekey target
WHERE d.id = target.id;

COMMIT;
