-- 为多联机主机表添加concentrator_id字段
-- 创建时间: 2024-01-20

-- 添加concentrator_id字段
ALTER TABLE multi_unit_ac_hosts 
ADD COLUMN concentrator_id INTEGER NOT NULL DEFAULT 1;

-- 添加字段注释
COMMENT ON COLUMN multi_unit_ac_hosts.concentrator_id IS '智能控制器索引序号，作为空调四段地址格式中的第一段，与设备uuid一一对应，范围1-65535';

-- 添加约束检查
ALTER TABLE multi_unit_ac_hosts 
ADD CONSTRAINT check_concentrator_id_range 
CHECK (concentrator_id >= 1 AND concentrator_id <= 65535);

-- 为现有记录设置默认值
UPDATE multi_unit_ac_hosts SET concentrator_id = 1 WHERE concentrator_id IS NULL;