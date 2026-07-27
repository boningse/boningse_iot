-- 为 protocol_configs 表添加 tenant_id 字段
ALTER TABLE protocol_configs ADD COLUMN tenant_id UUID;

-- 添加外键约束
ALTER TABLE protocol_configs ADD CONSTRAINT fk_protocol_configs_tenant_id 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 添加索引以提高查询性能
CREATE INDEX idx_protocol_configs_tenant_id ON protocol_configs(tenant_id);

-- 验证修改
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'protocol_configs' 
ORDER BY ordinal_position;