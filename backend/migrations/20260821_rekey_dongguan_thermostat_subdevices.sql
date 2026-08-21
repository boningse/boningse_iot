BEGIN;

-- Rekey Dongguan Center thermostat children with the identifier used by the
-- configured gateway batch router: {gateway IMEI}-{actual child sequence}.
CREATE TEMP TABLE dongguan_thermostat_subdevice_rekey ON COMMIT DROP AS
SELECT
  d.id,
  p.imei || '-' || d.sub_device_sequence::text AS new_identity
FROM devices d
JOIN devices p ON p.id = d.parent_device_id
WHERE d.tenant_id = '4a5a7e77-22f1-4601-9b37-77f88ca2fd4b'
  AND d.parent_device_id IS NOT NULL
  AND d.protocol_config_id = '73d17555-fed3-413f-88f1-0ece5ed37b23'
  AND p.imei IS NOT NULL
  AND d.sub_device_sequence IS NOT NULL;

-- device_id is globally unique. Move the whole target set to temporary values
-- first so rows that currently hold another row's final value cannot collide.
UPDATE devices d
SET device_id = '__dongguan_thermostat_rekey__' || d.id::text,
    imei = '__dongguan_thermostat_rekey__' || d.id::text,
    updated_at = NOW()
FROM dongguan_thermostat_subdevice_rekey target
WHERE d.id = target.id;

UPDATE devices d
SET device_id = target.new_identity,
    imei = target.new_identity,
    updated_at = NOW()
FROM dongguan_thermostat_subdevice_rekey target
WHERE d.id = target.id;

COMMIT;
