-- 修复 multi_unit_ac_control_logs 表结构
-- 添加缺失的字段以匹配代码中的使用

-- 添加 indoor_unit_id 字段
ALTER TABLE multi_unit_ac_control_logs 
ADD COLUMN IF NOT EXISTS indoor_unit_id UUID REFERENCES multi_unit_ac_indoor_units(id);

-- 添加 operation_value 字段
ALTER TABLE multi_unit_ac_control_logs 
ADD COLUMN IF NOT EXISTS operation_value JSONB;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_control_logs_indoor_unit_id 
ON multi_unit_ac_control_logs(indoor_unit_id);

-- 添加注释
COMMENT ON COLUMN multi_unit_ac_control_logs.indoor_unit_id IS '内机ID（为空表示主机操作）';
COMMENT ON COLUMN multi_unit_ac_control_logs.operation_value IS '操作参数值';