-- 按租户分表的数据库函数
-- 表名格式: lighting_electrical_bndk_{tenant_id}

-- 获取租户表名
CREATE OR REPLACE FUNCTION get_tenant_lighting_electrical_table_name(manufacturer_code VARCHAR, tenant_code VARCHAR)
RETURNS VARCHAR AS $$
BEGIN
    RETURN 'lighting_electrical_' || LOWER(manufacturer_code) || '_' || tenant_code;
END;
$$ LANGUAGE plpgsql;

-- 确保租户表存在
CREATE OR REPLACE FUNCTION ensure_tenant_lighting_electrical_tables(manufacturer_code VARCHAR, tenant_code VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    target_table_name VARCHAR;
    table_exists BOOLEAN;
BEGIN
    -- 获取表名
    target_table_name := get_tenant_lighting_electrical_table_name(manufacturer_code, tenant_code);
    
    -- 检查表是否存在
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = target_table_name
    ) INTO table_exists;
    
    -- 如果表不存在，创建表
    IF NOT table_exists THEN
        EXECUTE format('
            CREATE TABLE %I (
                id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                device_id UUID NOT NULL,
                imei VARCHAR(100) NOT NULL,
                voltage DECIMAL(10,3) DEFAULT 0.000,
                current DECIMAL(10,3) DEFAULT 0.000,
                power DECIMAL(10,3) DEFAULT 0.000,
                energy DECIMAL(10,3) DEFAULT 0.000,
                data_timestamp TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            )', target_table_name);
        
        -- 创建索引（使用MD5哈希避免名称过长）
        EXECUTE format('CREATE INDEX %I ON %I (imei)', 'idx_' || substring(md5(target_table_name), 1, 8) || '_imei', target_table_name);
        EXECUTE format('CREATE INDEX %I ON %I (created_at)', 'idx_' || substring(md5(target_table_name), 1, 8) || '_time', target_table_name);
        EXECUTE format('CREATE INDEX %I ON %I (imei, created_at)', 'idx_' || substring(md5(target_table_name), 1, 8) || '_both', target_table_name);
        
        RAISE NOTICE '租户表 % 创建成功', target_table_name;
    END IF;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '创建租户表失败: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 插入租户表数据（简化版本，匹配代码调用）
CREATE OR REPLACE FUNCTION insert_tenant_lighting_electrical_data(
    manufacturer_code VARCHAR,
    tenant_code VARCHAR,
    device_id UUID,
    device_imei VARCHAR,
    device_voltage DECIMAL,
    device_current DECIMAL,
    device_power DECIMAL,
    device_energy DECIMAL,
    data_timestamp TIMESTAMP WITH TIME ZONE
)
RETURNS BOOLEAN AS $$
DECLARE
    table_name VARCHAR;
BEGIN

    table_name := get_tenant_lighting_electrical_table_name(manufacturer_code, tenant_code);
    
    -- 插入数据
    EXECUTE format('
        INSERT INTO %I (
            device_id, imei, voltage, current, power,
            energy, data_timestamp, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $7, $7
        )', table_name)
    USING device_id, device_imei, device_voltage, device_current, device_power, device_energy, data_timestamp;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '插入租户表数据失败: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- 查询租户表最新数据
CREATE OR REPLACE FUNCTION get_latest_tenant_lighting_electrical_data(
    manufacturer_code VARCHAR,
    tenant_code VARCHAR,
    device_imei_param VARCHAR
)
RETURNS TABLE(
    id UUID,
    device_id UUID,
    imei VARCHAR,
    voltage DECIMAL,
    current DECIMAL,
    power DECIMAL,
    energy DECIMAL,
    data_timestamp TIMESTAMP,
    created_at TIMESTAMP,
    updated_at TIMESTAMP
) AS $$
DECLARE
    table_name VARCHAR;
    table_exists BOOLEAN;
BEGIN
    -- 获取表名
    table_name := get_tenant_lighting_electrical_table_name(manufacturer_code, tenant_code);
    
    -- 检查表是否存在
    SELECT EXISTS (
        SELECT FROM information_schema.tables t
        WHERE t.table_schema = 'public' 
        AND t.table_name = get_latest_tenant_lighting_electrical_data.table_name
    ) INTO table_exists;
    
    -- 如果表不存在，返回空结果
    IF NOT table_exists THEN
        RETURN;
    END IF;
    
    -- 查询最新数据
    RETURN QUERY EXECUTE format('
        SELECT * FROM %I 
        WHERE imei = $1 
        ORDER BY created_at DESC 
        LIMIT 1', table_name)
    USING device_imei_param;
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '查询租户表最新数据失败: %', SQLERRM;
        RETURN;
END;
$$ LANGUAGE plpgsql;

-- 清理租户表旧数据
CREATE OR REPLACE FUNCTION cleanup_tenant_lighting_electrical_data(
    manufacturer_code VARCHAR,
    tenant_code VARCHAR,
    days_to_keep INTEGER DEFAULT 90
)
RETURNS INTEGER AS $$
DECLARE
    table_name VARCHAR;
    table_exists BOOLEAN;
    deleted_count INTEGER;
BEGIN
    -- 获取表名
    table_name := get_tenant_lighting_electrical_table_name(manufacturer_code, tenant_code);
    
    -- 检查表是否存在
    SELECT EXISTS (
        SELECT FROM information_schema.tables t
        WHERE t.table_schema = 'public' 
        AND t.table_name = cleanup_tenant_lighting_electrical_data.table_name
    ) INTO table_exists;
    
    -- 如果表不存在，返回0
    IF NOT table_exists THEN
        RETURN 0;
    END IF;
    
    -- 删除旧数据
    EXECUTE format('
        DELETE FROM %I 
        WHERE created_at < CURRENT_DATE - INTERVAL ''%s days''', 
        table_name, days_to_keep);
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RAISE NOTICE '租户表 % 清理了 % 条旧数据', table_name, deleted_count;
    
    RETURN deleted_count;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '清理租户表旧数据失败: %', SQLERRM;
        RETURN 0;
END;
$$ LANGUAGE plpgsql;