-- 添加 group_name 字段到多联机主机表
-- 创建时间: 2024-01-16

-- 添加 group_name 字段到 multi_unit_ac_hosts 表
ALTER TABLE multi_unit_ac_hosts 
ADD COLUMN IF NOT EXISTS group_name VARCHAR(100);

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_hosts_group_name ON multi_unit_ac_hosts(group_name);

-- 添加注释
COMMENT ON COLUMN multi_unit_ac_hosts.group_name IS '分组名称';