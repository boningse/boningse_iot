const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const store = require('../services/telemetryStore');

const run = async () => {
  const pool = new Pool(getPoolConfig());
  const deviceResult = await pool.query(
    `SELECT d.id, d.tenant_id, d.manufacturer_code, d.imei
     FROM devices d
     JOIN control_device_assignments assignment ON assignment.device_id = d.id
     WHERE assignment.module_type = 'switch' AND assignment.is_active = true
     LIMIT 1`
  );
  const device = deviceResult.rows[0];
  if (!device) throw new Error('No switch device available for split telemetry smoke test');

  const marker = `split-smoke-${Date.now()}`;
  try {
    const status = await store.saveStatus({
      device,
      moduleType: 'switch',
      state: { switch_1: true },
      rawPayload: { marker }
    });
    const electrical = await store.saveElectrical({
      device,
      moduleType: 'switch',
      phaseType: 'three_phase',
      data: {
        power: 12.34,
        temperature_a: 31.2,
        temperature_b: 32.3,
        temperature_c: 33.4,
        raw_payload: { marker }
      }
    });
    const control = await store.logControl({
      device,
      moduleType: 'switch',
      action: 'smoke_test',
      command: { marker },
      status: 'sent'
    });
    const verified = await pool.query(
      `SELECT
         (SELECT count(*) FROM switch_status_measurements WHERE raw_payload->>'marker' = $1) AS status_rows,
         (SELECT count(*) FROM switch_electrical_measurements WHERE raw_payload->>'marker' = $1 AND temperature_c = 33.4) AS electrical_rows,
         (SELECT count(*) FROM switch_control_logs WHERE command->>'marker' = $1) AS control_rows`,
      [marker]
    );
    console.log(JSON.stringify({
      ids: { status: status.id, electrical: electrical.id, control: control.id },
      verified: verified.rows[0]
    }));
  } finally {
    await pool.query("DELETE FROM switch_status_measurements WHERE raw_payload->>'marker' = $1", [marker]);
    await pool.query("DELETE FROM switch_electrical_measurements WHERE raw_payload->>'marker' = $1", [marker]);
    await pool.query("DELETE FROM switch_control_logs WHERE command->>'marker' = $1", [marker]);
    await pool.end();
  }
};

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
