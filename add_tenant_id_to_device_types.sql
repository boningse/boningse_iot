-- 为device_types表添加tenant_id字段
ALTER TABLE device_types ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- 添加外键约束
ALTER TABLE device_types ADD CONSTRAINT fk_device_types_tenant_id 
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE SET NULL;

-- 为现有数据设置默认租户ID（可选，根据需要调整）
-- UPDATE device_types SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_device_types_tenant_id ON device_types(tenant_id);

-- 验证修改
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'device_types' AND table_schema = 'public' 
ORDER BY ordinal_position;