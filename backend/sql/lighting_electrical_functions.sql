-- 照明电气数据函数
-- 创建照明电气数据插入函数
CREATE OR REPLACE FUNCTION insert_lighting_electrical_data(
    manufacturer_code VARCHAR,
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
    device_id UUID;
    tenant_code VARCHAR;
BEGIN
    -- 获取设备ID和租户代码
    SELECT d.id, t.code INTO device_id, tenant_code 
    FROM devices d
    JOIN tenants t ON d.tenant_id = t.id
    WHERE d.imei = device_imei 
    LIMIT 1;
    
    -- 如果找不到设备ID，记录警告并继续
    IF device_id IS NULL THEN
        RAISE WARNING '找不到IMEI为%的设备ID', device_imei;
        RETURN FALSE;
    END IF;
    
    -- 设置表名 (使用正确的格式 lighting_electrical_bndk_租户代码)
    table_name := 'lighting_electrical_bndk_' || tenant_code;
    
    -- 确保表存在
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            device_id UUID,
            imei VARCHAR(100) NOT NULL,
            voltage DECIMAL(10,3) DEFAULT 0.000,
            current DECIMAL(10,3) DEFAULT 0.000,
            power DECIMAL(10,3) DEFAULT 0.000,
            energy DECIMAL(10,3) DEFAULT 0.000,
            data_timestamp TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP(6) WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )', table_name);
    
    -- 创建索引（如果不存在）
    BEGIN
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_imei ON %I (imei)',
            substring(md5(table_name), 1, 8), table_name);
        EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_timestamp ON %I (data_timestamp)',
            substring(md5(table_name), 1, 8), table_name);
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '创建索引失败: %', SQLERRM;
    END;
    
    -- 插入数据
    EXECUTE format('
        INSERT INTO %I (
            device_id, imei, voltage, current, power, energy, 
            data_timestamp, created_at, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $7, $7
        )', table_name)
    USING device_id, device_imei, device_voltage, device_current, device_power, device_energy, data_timestamp;
    
    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING '插入照明电气数据失败: %', SQLERRM;
        RETURN FALSE;
END;
$$ LANGUAGE plpgsql;