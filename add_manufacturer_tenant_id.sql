-- 为厂商表添加租户ID字段
ALTER TABLE manufacturers ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- 为现有厂商数据设置默认租户（如果有默认租户的话）
-- UPDATE manufacturers SET tenant_id = (SELECT id FROM tenants LIMIT 1) WHERE tenant_id IS NULL;

-- 添加索引以提高查询性能
CREATE INDEX idx_manufacturers_tenant_id ON manufacturers(tenant_id);

COMMIT;