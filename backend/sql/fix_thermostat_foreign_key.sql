-- 修复温控器外键约束，支持级联删除
-- 解决删除设备时的外键约束错误

-- 1. 删除现有的外键约束
ALTER TABLE thermostat_properties DROP CONSTRAINT IF EXISTS thermostat_properties_device_id_fkey;

-- 2. 重新创建外键约束，添加级联删除
ALTER TABLE thermostat_properties 
ADD CONSTRAINT thermostat_properties_device_id_fkey 
FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE;

-- 3. 同样修复其他温控器相关表的外键约束
ALTER TABLE thermostat_schedules DROP CONSTRAINT IF EXISTS thermostat_schedules_device_id_fkey;
ALTER TABLE thermostat_schedules 
ADD CONSTRAINT thermostat_schedules_device_id_fkey 
FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE;

ALTER TABLE thermostat_runtime_stats DROP CONSTRAINT IF EXISTS thermostat_runtime_stats_device_id_fkey;
ALTER TABLE thermostat_runtime_stats 
ADD CONSTRAINT thermostat_runtime_stats_device_id_fkey 
FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE;

ALTER TABLE thermostat_control_logs DROP CONSTRAINT IF EXISTS thermostat_control_logs_device_id_fkey;
ALTER TABLE thermostat_control_logs 
ADD CONSTRAINT thermostat_control_logs_device_id_fkey 
FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE;

-- 验证外键约束已正确设置
SELECT 
    tc.constraint_name, 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    rc.delete_rule
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints AS rc
      ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY' 
  AND tc.table_name IN ('thermostat_properties', 'thermostat_schedules', 'thermostat_runtime_stats', 'thermostat_control_logs')
  AND kcu.column_name = 'device_id';

SELECT 'Foreign key constraints fixed successfully!' as result;