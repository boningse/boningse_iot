-- 创建按租户分表的电表数据存储表
-- 表名格式: electric_meter_data_{tenant_code}
-- 包含协议配置中定义的所有电气参数

-- 创建电表数据表的通用函数
CREATE OR REPLACE FUNCTION create_electric_meter_data_table(tenant_code VARCHAR)
RETURNS VOID AS $$
DECLARE
    table_name VARCHAR;
BEGIN
    table_name := 'electric_meter_data_' || tenant_code;
    
    -- 动态创建表
    EXECUTE format('
        CREATE TABLE IF NOT EXISTS %I (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            electric_meter_id UUID NOT NULL,
            device_id UUID NOT NULL,
            meter_number VARCHAR(100) NOT NULL,
            meter_address VARCHAR(50) NOT NULL,
            
            -- 电能参数 (kWh)
            total_active_energy DECIMAL(15,3),           -- 总有功电能
            forward_active_energy DECIMAL(15,3),         -- 正向有功电能
            reverse_active_energy DECIMAL(15,3),         -- 反向有功电能
            
            -- 电流参数 (A)
            phase_a_current DECIMAL(10,3),               -- A相电流
            phase_b_current DECIMAL(10,3),               -- B相电流
            phase_c_current DECIMAL(10,3),               -- C相电流
            
            -- 相电压参数 (V)
            phase_a_voltage DECIMAL(10,2),               -- A相电压
            phase_b_voltage DECIMAL(10,2),               -- B相电压
            phase_c_voltage DECIMAL(10,2),               -- C相电压
            
            -- 线电压参数 (V)
            line_ab_voltage DECIMAL(10,2),               -- AB相电压
            line_ac_voltage DECIMAL(10,2),               -- AC相电压
            line_bc_voltage DECIMAL(10,2),               -- BC相电压
            
            -- 功率参数 (kW)
            phase_a_power DECIMAL(12,4),                 -- A相功率
            phase_b_power DECIMAL(12,4),                 -- B相功率
            phase_c_power DECIMAL(12,4),                 -- C相功率
            total_power DECIMAL(12,4),                   -- ABC相总功率
            
            -- 功率因数参数
            phase_a_power_factor DECIMAL(6,4),           -- A相功率因数
            phase_b_power_factor DECIMAL(6,4),           -- B相功率因数
            phase_c_power_factor DECIMAL(6,4),           -- C相功率因数
            total_power_factor DECIMAL(6,4),             -- ABC相总功率因数
            
            -- 温度参数 (°C)
            phase_a_temperature DECIMAL(6,2),            -- A相温度
            phase_b_temperature DECIMAL(6,2),            -- B相温度
            phase_c_temperature DECIMAL(6,2),            -- C相温度
            
            -- 频率参数 (Hz)
            frequency DECIMAL(6,3),                      -- 频率
            
            -- 数据质量和时间戳
            data_quality INTEGER DEFAULT 100,            -- 数据质量 (0-100)
            raw_data JSONB,                              -- 原始数据
            parsed_data JSONB,                           -- 解析后的数据
            collection_timestamp TIMESTAMP WITH TIME ZONE NOT NULL, -- 采集时间戳
            received_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(), -- 接收时间戳
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            
            -- 外键约束 (暂时注释掉，因为electric_meters表不存在)
            -- CONSTRAINT fk_%I_electric_meter FOREIGN KEY (electric_meter_id) REFERENCES electric_meters(id) ON DELETE CASCADE,
            CONSTRAINT fk_%I_device FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
        )', table_name, table_name);
    
    -- 创建索引
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_electric_meter_id ON %I (electric_meter_id)', table_name, table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_device_id ON %I (device_id)', table_name, table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_collection_timestamp ON %I (collection_timestamp)', table_name, table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_meter_number ON %I (meter_number)', table_name, table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_meter_address ON %I (meter_address)', table_name, table_name);
    
    -- 创建复合索引
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_meter_time ON %I (electric_meter_id, collection_timestamp)', table_name, table_name);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%I_device_time ON %I (device_id, collection_timestamp)', table_name, table_name);
    
    RAISE NOTICE '已创建电表数据表: %', table_name;
END;
$$ LANGUAGE plpgsql;

-- 为现有租户创建电表数据表
DO $$
DECLARE
    tenant_rec RECORD;
BEGIN
    FOR tenant_rec IN SELECT code FROM tenants WHERE status = 'active' LOOP
        PERFORM create_electric_meter_data_table(tenant_rec.code);
    END LOOP;
END;
$$;

-- 创建触发器函数，当新增租户时自动创建对应的电表数据表
CREATE OR REPLACE FUNCTION auto_create_electric_meter_data_table()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'active' THEN
        PERFORM create_electric_meter_data_table(NEW.code);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器
DROP TRIGGER IF EXISTS trigger_auto_create_electric_meter_data_table ON tenants;
CREATE TRIGGER trigger_auto_create_electric_meter_data_table
    AFTER INSERT OR UPDATE ON tenants
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_electric_meter_data_table();

-- 创建删除电表数据表的函数（用于租户删除时清理）
CREATE OR REPLACE FUNCTION drop_electric_meter_data_table(tenant_code VARCHAR)
RETURNS VOID AS $$
DECLARE
    table_name VARCHAR;
BEGIN
    table_name := 'electric_meter_data_' || tenant_code;
    
    -- 检查表是否存在
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = table_name) THEN
        EXECUTE format('DROP TABLE %I CASCADE', table_name);
        RAISE NOTICE '已删除电表数据表: %', table_name;
    ELSE
        RAISE NOTICE '电表数据表不存在: %', table_name;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 创建查询所有租户电表数据的视图函数
CREATE OR REPLACE FUNCTION get_all_electric_meter_data(
    start_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    end_time TIMESTAMP WITH TIME ZONE DEFAULT NULL,
    meter_id UUID DEFAULT NULL
)
RETURNS TABLE(
    tenant_code VARCHAR,
    id UUID,
    electric_meter_id UUID,
    device_id UUID,
    meter_number VARCHAR,
    meter_address VARCHAR,
    total_active_energy DECIMAL,
    forward_active_energy DECIMAL,
    reverse_active_energy DECIMAL,
    phase_a_current DECIMAL,
    phase_b_current DECIMAL,
    phase_c_current DECIMAL,
    phase_a_voltage DECIMAL,
    phase_b_voltage DECIMAL,
    phase_c_voltage DECIMAL,
    line_ab_voltage DECIMAL,
    line_ac_voltage DECIMAL,
    line_bc_voltage DECIMAL,
    phase_a_power DECIMAL,
    phase_b_power DECIMAL,
    phase_c_power DECIMAL,
    total_power DECIMAL,
    phase_a_power_factor DECIMAL,
    phase_b_power_factor DECIMAL,
    phase_c_power_factor DECIMAL,
    total_power_factor DECIMAL,
    phase_a_temperature DECIMAL,
    phase_b_temperature DECIMAL,
    phase_c_temperature DECIMAL,
    frequency DECIMAL,
    data_quality INTEGER,
    collection_timestamp TIMESTAMP WITH TIME ZONE,
    received_timestamp TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE
) AS $$
DECLARE
    tenant_rec RECORD;
    query_text TEXT;
BEGIN
    query_text := '';
    
    FOR tenant_rec IN SELECT code FROM tenants WHERE status = 'active' LOOP
        IF query_text != '' THEN
            query_text := query_text || ' UNION ALL ';
        END IF;
        
        query_text := query_text || format('
            SELECT ''%s'' as tenant_code,
                   id, electric_meter_id, device_id, meter_number, meter_address,
                   total_active_energy, forward_active_energy, reverse_active_energy,
                   phase_a_current, phase_b_current, phase_c_current,
                   phase_a_voltage, phase_b_voltage, phase_c_voltage,
                   line_ab_voltage, line_ac_voltage, line_bc_voltage,
                   phase_a_power, phase_b_power, phase_c_power, total_power,
                   phase_a_power_factor, phase_b_power_factor, phase_c_power_factor, total_power_factor,
                   phase_a_temperature, phase_b_temperature, phase_c_temperature,
                   frequency, data_quality, collection_timestamp, received_timestamp, created_at
            FROM electric_meter_data_%s
            WHERE 1=1', tenant_rec.code, tenant_rec.code);
        
        IF start_time IS NOT NULL THEN
            query_text := query_text || format(' AND collection_timestamp >= ''%s''', start_time);
        END IF;
        
        IF end_time IS NOT NULL THEN
            query_text := query_text || format(' AND collection_timestamp <= ''%s''', end_time);
        END IF;
        
        IF meter_id IS NOT NULL THEN
            query_text := query_text || format(' AND electric_meter_id = ''%s''', meter_id);
        END IF;
    END LOOP;
    
    IF query_text != '' THEN
        query_text := query_text || ' ORDER BY collection_timestamp DESC';
        RETURN QUERY EXECUTE query_text;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 创建数据插入的辅助函数
CREATE OR REPLACE FUNCTION insert_electric_meter_data(
    p_tenant_code VARCHAR,
    p_electric_meter_id UUID,
    p_device_id UUID,
    p_meter_number VARCHAR,
    p_meter_address VARCHAR,
    p_data JSONB,
    p_collection_timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
)
RETURNS UUID AS $$
DECLARE
    table_name VARCHAR;
    new_id UUID;
BEGIN
    table_name := 'electric_meter_data_' || p_tenant_code;
    new_id := gen_random_uuid();
    
    EXECUTE format('
        INSERT INTO %I (
            id, electric_meter_id, device_id, meter_number, meter_address,
            total_active_energy, forward_active_energy, reverse_active_energy,
            phase_a_current, phase_b_current, phase_c_current,
            phase_a_voltage, phase_b_voltage, phase_c_voltage,
            line_ab_voltage, line_ac_voltage, line_bc_voltage,
            phase_a_power, phase_b_power, phase_c_power, total_power,
            phase_a_power_factor, phase_b_power_factor, phase_c_power_factor, total_power_factor,
            phase_a_temperature, phase_b_temperature, phase_c_temperature,
            frequency, raw_data, parsed_data, collection_timestamp
        ) VALUES (
            $1, $2, $3, $4, $5,
            ($6->>''total_active_energy'')::DECIMAL,
            ($6->>''forward_active_energy'')::DECIMAL,
            ($6->>''reverse_active_energy'')::DECIMAL,
            ($6->>''phase_a_current'')::DECIMAL,
            ($6->>''phase_b_current'')::DECIMAL,
            ($6->>''phase_c_current'')::DECIMAL,
            ($6->>''phase_a_voltage'')::DECIMAL,
            ($6->>''phase_b_voltage'')::DECIMAL,
            ($6->>''phase_c_voltage'')::DECIMAL,
            ($6->>''line_ab_voltage'')::DECIMAL,
            ($6->>''line_ac_voltage'')::DECIMAL,
            ($6->>''line_bc_voltage'')::DECIMAL,
            ($6->>''phase_a_power'')::DECIMAL,
            ($6->>''phase_b_power'')::DECIMAL,
            ($6->>''phase_c_power'')::DECIMAL,
            ($6->>''total_power'')::DECIMAL,
            ($6->>''phase_a_power_factor'')::DECIMAL,
            ($6->>''phase_b_power_factor'')::DECIMAL,
            ($6->>''phase_c_power_factor'')::DECIMAL,
            ($6->>''total_power_factor'')::DECIMAL,
            ($6->>''phase_a_temperature'')::DECIMAL,
            ($6->>''phase_b_temperature'')::DECIMAL,
            ($6->>''phase_c_temperature'')::DECIMAL,
            ($6->>''frequency'')::DECIMAL,
            $6, $6, $7
        )', table_name)
    USING new_id, p_electric_meter_id, p_device_id, p_meter_number, p_meter_address, p_data, p_collection_timestamp;
    
    RETURN new_id;
END;
$$ LANGUAGE plpgsql;

-- 添加注释
COMMENT ON FUNCTION create_electric_meter_data_table(VARCHAR) IS '为指定租户创建电表数据存储表';
COMMENT ON FUNCTION drop_electric_meter_data_table(VARCHAR) IS '删除指定租户的电表数据存储表';
COMMENT ON FUNCTION get_all_electric_meter_data(TIMESTAMP WITH TIME ZONE, TIMESTAMP WITH TIME ZONE, UUID) IS '查询所有租户的电表数据';
COMMENT ON FUNCTION insert_electric_meter_data(VARCHAR, UUID, UUID, VARCHAR, VARCHAR, JSONB, TIMESTAMP WITH TIME ZONE) IS '向指定租户的电表数据表插入数据';

-- 显示创建的表
SELECT 
    schemaname,
    tablename,
    tableowner
FROM pg_tables 
WHERE tablename LIKE 'electric_meter_data_%'
ORDER BY tablename;