-- 添加DTU网关架构支持的数据库迁移脚本
-- 执行时间：请在维护窗口期间执行

-- 1. 为devices表添加DTU网关支持字段
ALTER TABLE devices 
ADD COLUMN device_category VARCHAR(20) DEFAULT 'standalone' CHECK (device_category IN ('standalone', 'gateway', 'sub_device')),
ADD COLUMN parent_device_id UUID REFERENCES devices(id),
ADD COLUMN connection_config JSONB DEFAULT '{}';

-- 添加注释
COMMENT ON COLUMN devices.device_category IS '设备分类：独立设备、网关设备、子设备';
COMMENT ON COLUMN devices.parent_device_id IS '父设备ID（用于子设备关联到网关）';
COMMENT ON COLUMN devices.connection_config IS '连接配置（MQTT、Modbus等）';

-- 2. 为electric_meters表添加DTU关联和电表类型字段
ALTER TABLE electric_meters 
ADD COLUMN dtu_device_id UUID REFERENCES devices(id),
ADD COLUMN meter_type VARCHAR(20) DEFAULT 'single_phase' CHECK (meter_type IN ('single_phase', 'three_phase', 'smart_meter'));

-- 添加注释
COMMENT ON COLUMN electric_meters.dtu_device_id IS 'DTU设备ID（用于DTU网关模式）';
COMMENT ON COLUMN electric_meters.meter_type IS '电表类型';

-- 3. 创建索引以提高查询性能
CREATE INDEX idx_devices_device_category ON devices(device_category);
CREATE INDEX idx_devices_parent_device_id ON devices(parent_device_id);
CREATE INDEX idx_electric_meters_dtu_device_id ON electric_meters(dtu_device_id);
CREATE INDEX idx_electric_meters_meter_type ON electric_meters(meter_type);

-- 4. 更新现有数据（可选）
-- 将现有设备标记为独立设备
UPDATE devices SET device_category = 'standalone' WHERE device_category IS NULL;

-- 将现有电表标记为单相电表
UPDATE electric_meters SET meter_type = 'single_phase' WHERE meter_type IS NULL;

-- 5. 创建视图以便于查询DTU和其子设备
CREATE OR REPLACE VIEW v_dtu_devices AS
SELECT 
    d.id,
    d.name,
    d.device_id,
    d.imei,
    d.manufacturer_code,
    d.status,
    d.last_seen_at,
    d.connection_config,
    COUNT(sub.id) as sub_device_count,
    COUNT(em.id) as electric_meter_count
FROM devices d
LEFT JOIN devices sub ON d.id = sub.parent_device_id
LEFT JOIN electric_meters em ON d.id = em.dtu_device_id
WHERE d.device_category = 'gateway'
GROUP BY d.id, d.name, d.device_id, d.imei, d.manufacturer_code, d.status, d.last_seen_at, d.connection_config;

-- 6. 创建视图以便于查询电表及其DTU信息
CREATE OR REPLACE VIEW v_electric_meters_with_dtu AS
SELECT 
    em.id,
    em.name,
    em.meter_number,
    em.meter_address,
    em.meter_type,
    em.status,
    em.collection_interval,
    d.name as device_name,
    d.status as device_status,
    dtu.id as dtu_id,
    dtu.name as dtu_name,
    dtu.imei as dtu_imei,
    dtu.status as dtu_status,
    dtu.last_seen_at as dtu_last_seen_at
FROM electric_meters em
JOIN devices d ON em.device_id = d.id
LEFT JOIN devices dtu ON em.dtu_device_id = dtu.id;

-- 7. 添加约束确保数据一致性
-- 确保子设备不能作为其他设备的父设备
ALTER TABLE devices ADD CONSTRAINT check_device_hierarchy 
CHECK (
    (device_category = 'sub_device' AND parent_device_id IS NOT NULL) OR
    (device_category = 'gateway' AND parent_device_id IS NULL) OR
    (device_category = 'standalone' AND parent_device_id IS NULL)
);

-- 8. 创建触发器函数来维护设备层级关系
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

-- 创建触发器
CREATE TRIGGER trigger_check_device_hierarchy
    BEFORE INSERT OR UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION check_device_hierarchy_trigger();

-- 9. 插入示例DTU设备配置
INSERT INTO devices (
    id,
    name,
    device_id,
    imei,
    manufacturer_code,
    device_category,
    status,
    tenant_id,
    device_type_id,
    created_by,
    connection_config
) VALUES (
    gen_random_uuid(),
    '示例DTU网关',
    'DTU_EXAMPLE_001',
    '865661074511729',
    'BNDBA',
    'gateway',
    'offline',
    (SELECT id FROM tenants LIMIT 1),
    (SELECT id FROM device_types WHERE name LIKE '%DTU%' OR name LIKE '%网关%' LIMIT 1),
    (SELECT id FROM users LIMIT 1),
    '{
        "type": "mqtt",
        "mqtt": {
            "subscribe_topics": ["zhhl/BNDBA/865661074511729/publish"],
            "publish_topics": ["zhhl/BNDBA/865661074511729/command"],
            "heartbeat_interval": 60,
            "offline_timeout": 300
        },
        "modbus": {
            "protocol": "rtu",
            "baud_rate": 9600,
            "data_bits": 8,
            "stop_bits": 1,
            "parity": "none"
        }
    }'
) ON CONFLICT DO NOTHING;

-- 提交事务
COMMIT;

-- 验证迁移结果
SELECT 'Migration completed successfully' as status;
SELECT COUNT(*) as device_count FROM devices;
SELECT COUNT(*) as electric_meter_count FROM electric_meters;
SELECT COUNT(*) as dtu_device_count FROM devices WHERE device_category = 'gateway';