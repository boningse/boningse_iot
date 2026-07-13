-- 为协议配置表添加租户ID字段
-- 执行时间: 2025-01-17

-- 添加tenant_id字段
ALTER TABLE protocol_configs 
ADD COLUMN tenant_id UUID;

-- 添加外键约束
ALTER TABLE protocol_configs 
ADD CONSTRAINT fk_protocol_configs_tenant_id 
FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 为现有数据设置默认租户ID（假设存在一个默认租户）
-- 注意：在实际环境中，需要根据具体情况设置正确的租户ID
UPDATE protocol_configs 
SET tenant_id = (
    SELECT id FROM tenants 
    WHERE code = 'default' OR name = '默认租户' 
    LIMIT 1
)
WHERE tenant_id IS NULL;

-- 设置字段为非空
ALTER TABLE protocol_configs 
ALTER COLUMN tenant_id SET NOT NULL;

-- 添加索引以提高查询性能
CREATE INDEX idx_protocol_configs_tenant_id ON protocol_configs(tenant_id);

-- 更新唯一约束，包含租户ID
DROP INDEX IF EXISTS protocol_configs_manufacturer_code_device_type_is_default_key;
CREATE UNIQUE INDEX protocol_configs_manufacturer_code_device_type_tenant_id_is_default_key 
ON protocol_configs(manufacturer_code, device_type, tenant_id, is_default) 
WHERE is_default = true;

COMMENT ON COLUMN protocol_configs.tenant_id IS '所属租户ID';