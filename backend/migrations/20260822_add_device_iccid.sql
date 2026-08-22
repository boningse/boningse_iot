BEGIN;

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS iccid varchar(64),
  ADD COLUMN IF NOT EXISTS iccid_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS iccid_received_at timestamptz;

COMMENT ON COLUMN devices.iccid IS '设备或所属通信网关的SIM卡ICCID，用于流量充值';
COMMENT ON COLUMN devices.iccid_requested_at IS '首次发送ICCID读取命令的时间，避免重复读取';
COMMENT ON COLUMN devices.iccid_received_at IS '收到并保存ICCID的时间';

COMMIT;
