-- 设备层级管理增强脚本
-- 基于现有的device_category和parent_device_id字段，添加必要的索引、视图和约束

-- 1. 创建必要的索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_devices_device_category ON devices(device_category);
CREATE INDEX IF NOT EXISTS idx_devices_parent_device_id ON devices(parent_device_id);
CREATE INDEX IF NOT EXISTS idx_devices_tenant_category ON devices(tenant_id, device_category);

-- 2. 创建设备层级查询视图
CREATE OR REPLACE VIEW device_hierarchy_view AS
WITH RECURSIVE device_tree AS (
    -- 根节点（网关设备和独立设备）
    SELECT 
        d.id, d.name, d.imei, d.device_category, d.parent_device_id,
        d.tenant_id, d.status, d.location, d.created_at,
        0 as level, 
        ARRAY[d.id] as path,
        d.name as root_name,
        dt.name as device_type_name,
        t.name as tenant_name
    FROM devices d
    LEFT JOIN device_types dt ON d.device_type_id = dt.id
    LEFT JOIN tenants t ON d.tenant_id = t.id
    WHERE d.parent_device_id IS NULL
    
    UNION ALL
    
    -- 子节点
    SELECT 
        d.id, d.name, d.imei, d.device_category, d.parent_device_id,
        d.tenant_id, d.status, d.location, d.created_at,
        tree.level + 1,
        tree.path || d.id,
        tree.root_name,
        dt.name as device_type_name,
        t.name as tenant_name
    FROM devices d
    JOIN device_tree tree ON d.parent_device_id = tree.id
    LEFT JOIN device_types dt ON d.device_type_id = dt.id
    LEFT JOIN tenants t ON d.tenant_id = t.id
    WHERE NOT d.id = ANY(tree.path) -- 防止循环引用
)
SELECT * FROM device_tree
ORDER BY level, created_at;

-- 3. 创建设备统计视图
CREATE OR REPLACE VIEW device_statistics_view AS
SELECT 
    d.id,
    d.name,
    d.device_category,
    d.status,
    CASE 
        WHEN d.device_category = 'gateway' THEN 
            (SELECT COUNT(*) FROM devices WHERE parent_device_id = d.id)
        ELSE 0 
    END as children_count,
    CASE 
        WHEN d.device_category = 'sub_device' THEN 
            (SELECT name FROM devices WHERE id = d.parent_device_id)
        ELSE NULL 
    END as parent_name,
    CASE 
        WHEN d.device_category = 'sub_device' THEN 
            (SELECT id FROM devices WHERE id = d.parent_device_id)
        ELSE NULL 
    END as parent_id
FROM devices d;

-- 4. 创建设备层级关系约束（如果不存在）
DO $$
BEGIN
    -- 检查约束是否已存在
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'check_device_hierarchy' 
        AND table_name = 'devices'
    ) THEN
        ALTER TABLE devices ADD CONSTRAINT check_device_hierarchy 
        CHECK (
            (device_category = 'sub_device' AND parent_device_id IS NOT NULL) OR
            (device_category = 'gateway' AND parent_device_id IS NULL) OR
            (device_category = 'standalone' AND parent_device_id IS NULL)
        );
    END IF;
END $$;

-- 5. 创建触发器函数来维护设备层级关系
CREATE OR REPLACE FUNCTION check_device_hierarchy_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- 检查是否存在循环引用
    IF NEW.parent_device_id IS NOT NULL THEN
        WITH RECURSIVE device_hierarchy AS (
            SELECT id, parent_device_id, 1 as level
            FROM devices 
            WHERE id = NEW.parent_device_id
            
            UNION ALL
            
            SELECT d.id, d.parent_device_id, dh.level + 1
            FROM devices d
            INNER JOIN device_hierarchy dh ON d.id = dh.parent_device_id
            WHERE dh.level < 10  -- 防止无限递归
        )
        SELECT 1 FROM device_hierarchy WHERE id = NEW.id;
        
        IF FOUND THEN
            RAISE EXCEPTION '设备层级关系不能形成循环引用';
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 创建触发器（如果不存在）
DROP TRIGGER IF EXISTS trigger_check_device_hierarchy ON devices;
CREATE TRIGGER trigger_check_device_hierarchy
    BEFORE INSERT OR UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION check_device_hierarchy_trigger();

-- 7. 创建设备树形结构查询函数
CREATE OR REPLACE FUNCTION get_device_tree(p_tenant_id UUID DEFAULT NULL)
RETURNS TABLE (
    id UUID,
    name VARCHAR,
    device_category VARCHAR,
    parent_device_id UUID,
    level INTEGER,
    children_count BIGINT,
    status VARCHAR,
    device_type_name VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE device_tree AS (
        -- 根节点
        SELECT 
            d.id, d.name, d.device_category::VARCHAR, d.parent_device_id,
            0 as level,
            d.status::VARCHAR,
            dt.name as device_type_name
        FROM devices d
        LEFT JOIN device_types dt ON d.device_type_id = dt.id
        WHERE d.parent_device_id IS NULL
        AND (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
        
        UNION ALL
        
        -- 子节点
        SELECT 
            d.id, d.name, d.device_category::VARCHAR, d.parent_device_id,
            tree.level + 1,
            d.status::VARCHAR,
            dt.name as device_type_name
        FROM devices d
        JOIN device_tree tree ON d.parent_device_id = tree.id
        LEFT JOIN device_types dt ON d.device_type_id = dt.id
        WHERE (p_tenant_id IS NULL OR d.tenant_id = p_tenant_id)
    )
    SELECT 
        dt.id,
        dt.name,
        dt.device_category,
        dt.parent_device_id,
        dt.level,
        COALESCE(child_counts.children_count, 0) as children_count,
        dt.status,
        dt.device_type_name
    FROM device_tree dt
    LEFT JOIN (
        SELECT parent_device_id, COUNT(*) as children_count
        FROM devices 
        WHERE parent_device_id IS NOT NULL
        GROUP BY parent_device_id
    ) child_counts ON dt.id = child_counts.parent_device_id
    ORDER BY dt.level, dt.name;
END;
$$ LANGUAGE plpgsql;

-- 8. 验证数据库结构
SELECT 'Device hierarchy enhancement completed successfully' as status;

-- 显示当前设备分类统计
SELECT 
    device_category,
    COUNT(*) as count
FROM devices 
GROUP BY device_category
ORDER BY device_category;

-- 显示层级关系统计
SELECT 
    'Gateway devices' as type,
    COUNT(*) as count
FROM devices 
WHERE device_category = 'gateway'
UNION ALL
SELECT 
    'Sub devices' as type,
    COUNT(*) as count
FROM devices 
WHERE device_category = 'sub_device'
UNION ALL
SELECT 
    'Standalone devices' as type,
    COUNT(*) as count
FROM devices 
WHERE device_category = 'standalone';