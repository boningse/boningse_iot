-- 添加 sub_device_sequence 字段到 devices 表
-- 该字段用于标识同一网关下的不同子设备（如1,2,3,4,5,6等）

ALTER TABLE devices 
ADD COLUMN sub_device_sequence INTEGER;

-- 添加注释
COMMENT ON COLUMN devices.sub_device_sequence IS '子设备序列号，用于标识同一网关下的不同子设备（如1,2,3,4,5,6等）';

-- 创建索引以提高查询性能
CREATE INDEX idx_devices_parent_sub_sequence ON devices(parent_device_id, sub_device_sequence) 
WHERE parent_device_id IS NOT NULL AND sub_device_sequence IS NOT NULL;