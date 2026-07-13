-- 修改设备表IMEI字段约束，允许子设备与网关共享相同IMEI
-- 创建时间: 2025-01-25

-- 1. 首先删除现有的IMEI唯一约束
ALTER TABLE devices DROP CONSTRAINT IF EXISTS devices_imei_key;

-- 2. 创建条件唯一约束：只对非子设备（standalone、gateway）应用IMEI唯一性
-- 使用部分索引来实现条件唯一约束
CREATE UNIQUE INDEX CONCURRENTLY devices_imei_unique_non_sub_device 
ON devices (imei) 
WHERE device_category != 'sub_device' AND imei IS NOT NULL;

-- 3. 为子设备创建复合唯一约束：同一父设备下的子设备序号必须唯一
CREATE UNIQUE INDEX CONCURRENTLY devices_sub_device_sequence_unique 
ON devices (parent_device_id, sub_device_sequence) 
WHERE device_category = 'sub_device' AND parent_device_id IS NOT NULL AND sub_device_sequence IS NOT NULL;

-- 4. 添加检查约束：确保子设备必须有父设备ID
ALTER TABLE devices ADD CONSTRAINT check_sub_device_has_parent 
CHECK (
  (device_category = 'sub_device' AND parent_device_id IS NOT NULL) OR 
  (device_category != 'sub_device')
);

-- 5. 添加检查约束：确保子设备序号在合理范围内
ALTER TABLE devices ADD CONSTRAINT check_sub_device_sequence_range 
CHECK (
  (device_category = 'sub_device' AND sub_device_sequence >= 1 AND sub_device_sequence <= 999) OR 
  (device_category != 'sub_device' AND sub_device_sequence IS NULL)
);

-- 6. 创建索引以提高查询性能
CREATE INDEX CONCURRENTLY idx_devices_parent_device_id ON devices (parent_device_id) WHERE parent_device_id IS NOT NULL;
CREATE INDEX CONCURRENTLY idx_devices_device_category ON devices (device_category);
CREATE INDEX CONCURRENTLY idx_devices_imei_category ON devices (imei, device_category) WHERE imei IS NOT NULL;

-- 验证约束是否正确创建
-- 查看新创建的约束和索引
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE tablename = 'devices' 
AND indexname LIKE '%imei%' OR indexname LIKE '%sub_device%'
ORDER BY indexname;

-- 查看表约束
SELECT 
    conname,
    contype,
    pg_get_constraintdef(oid) as definition
FROM pg_constraint 
WHERE conrelid = 'devices'::regclass
AND conname LIKE '%imei%' OR conname LIKE '%sub_device%' OR conname LIKE '%parent%'
ORDER BY conname;