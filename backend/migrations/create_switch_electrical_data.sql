CREATE TABLE IF NOT EXISTS switch_electrical_data (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  manufacturer_code VARCHAR(20),
  imei VARCHAR(100) NOT NULL,
  device_name VARCHAR(255),
  phase_type VARCHAR(20) NOT NULL DEFAULT 'single_phase',
  voltage DECIMAL(10,3),
  current DECIMAL(10,3),
  power DECIMAL(10,3),
  energy DECIMAL(12,3),
  voltage_a DECIMAL(10,3),
  voltage_b DECIMAL(10,3),
  voltage_c DECIMAL(10,3),
  current_a DECIMAL(10,3),
  current_b DECIMAL(10,3),
  current_c DECIMAL(10,3),
  power_a DECIMAL(10,3),
  power_b DECIMAL(10,3),
  power_c DECIMAL(10,3),
  power_factor DECIMAL(8,3),
  power_factor_a DECIMAL(8,3),
  power_factor_b DECIMAL(8,3),
  power_factor_c DECIMAL(8,3),
  frequency DECIMAL(8,3),
  leakage_current DECIMAL(10,3),
  temperature DECIMAL(10,3),
  raw_payload JSONB DEFAULT '{}'::jsonb,
  data_timestamp TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_switch_electrical_data_imei_time
  ON switch_electrical_data(imei, data_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_switch_electrical_data_device_time
  ON switch_electrical_data(device_id, data_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_switch_electrical_data_tenant_time
  ON switch_electrical_data(tenant_id, data_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_switch_electrical_data_manufacturer
  ON switch_electrical_data(manufacturer_code);
