-- 多联机控制系统数据表创建脚本
-- 创建时间: 2024-01-16

-- 1. 多联机主机表
CREATE TABLE IF NOT EXISTS multi_unit_ac_hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    host_name VARCHAR(100) NOT NULL,
    imei VARCHAR(50) UNIQUE NOT NULL, -- 智能控制器的唯一设备标识号(UUID)
    concentrator_id INTEGER NOT NULL, -- 智能控制器索引序号，作为地址第一段，1-65535
    model VARCHAR(50),
    capacity INTEGER, -- 制冷量/制热量 (kW)
    max_indoor_units INTEGER DEFAULT 16, -- 最大内机数量
    current_indoor_units INTEGER DEFAULT 0, -- 当前连接内机数量
    host_status VARCHAR(20) DEFAULT 'offline', -- online, offline, fault, maintenance
    power_status BOOLEAN DEFAULT false, -- 主机电源状态
    operation_mode INTEGER DEFAULT 0, -- 运行模式: 0=自动, 1=制冷, 2=制热, 3=送风, 4=除湿
    target_temp DECIMAL(4,1), -- 目标温度
    current_temp DECIMAL(4,1), -- 当前温度
    error_code VARCHAR(10), -- 故障代码
    settings JSONB DEFAULT '{}', -- 其他设置参数
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 多联机内机表
CREATE TABLE IF NOT EXISTS multi_unit_ac_indoor_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID NOT NULL REFERENCES multi_unit_ac_hosts(id) ON DELETE CASCADE,
    unit_address VARCHAR(20) NOT NULL, -- 内机完整地址，格式：concentrator_id-channel-outdoor_unit-indoor_unit (如：1-1-1-1)
    channel_number INTEGER NOT NULL, -- 空调通道号，1-8
    outdoor_unit_address INTEGER NOT NULL, -- 空调外机地址
    indoor_unit_address INTEGER NOT NULL, -- 空调内机地址
    unit_name VARCHAR(100) NOT NULL,
    room_name VARCHAR(100), -- 房间名称
    model VARCHAR(50),
    power INTEGER, -- 内机容量单位(百瓦)
    brand INTEGER, -- 空调品牌
    ac_type VARCHAR(1) DEFAULT 'v', -- 空调类型: v=氟机vrv, w=风冷冷水, l=水冷冷水

    unit_status VARCHAR(20) DEFAULT 'offline', -- online, offline, fault, maintenance
    power_status BOOLEAN DEFAULT false, -- 内机电源状态
    operation_mode INTEGER DEFAULT 0, -- 运行模式: 0=自动, 1=制冷, 2=制热, 3=送风, 4=除湿
    fan_speed INTEGER DEFAULT 0, -- 风速: 0=自动, 1=高速, 2=中速, 3=中高速, 4=低速, 5=中低速, 6=微风, 7=强劲风
    target_temp DECIMAL(4,1), -- 目标温度
    current_temp DECIMAL(4,1), -- 当前温度
    humidity DECIMAL(4,1), -- 湿度
    swing_mode INTEGER DEFAULT 0, -- 摆风模式: 0=关闭, 1=上下, 2=左右, 3=全方位
    lock_status BOOLEAN DEFAULT false, -- 锁定状态
    error_code VARCHAR(10), -- 故障代码
    settings JSONB DEFAULT '{}', -- 其他设置参数
    position_x INTEGER, -- 在界面中的X坐标
    position_y INTEGER, -- 在界面中的Y坐标
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, unit_address),
    UNIQUE(host_id, channel_number, outdoor_unit_address, indoor_unit_address)
);

-- 3. 多联机控制日志表
CREATE TABLE IF NOT EXISTS multi_unit_ac_control_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES multi_unit_ac_hosts(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES multi_unit_ac_indoor_units(id) ON DELETE CASCADE,
    control_type VARCHAR(50) NOT NULL, -- power_on, power_off, set_temp, set_mode, set_fan_speed, etc.
    control_data JSONB NOT NULL, -- 控制参数
    mqtt_topic VARCHAR(200),
    mqtt_payload JSONB,
    result VARCHAR(20) DEFAULT 'pending', -- pending, success, failed, timeout
    error_message TEXT,
    user_id UUID REFERENCES users(id),
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 多联机运行统计表
CREATE TABLE IF NOT EXISTS multi_unit_ac_runtime_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES multi_unit_ac_hosts(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES multi_unit_ac_indoor_units(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    total_runtime INTEGER DEFAULT 0, -- 总运行时间(分钟)
    cooling_runtime INTEGER DEFAULT 0, -- 制冷运行时间(分钟)
    heating_runtime INTEGER DEFAULT 0, -- 制热运行时间(分钟)
    fan_runtime INTEGER DEFAULT 0, -- 送风运行时间(分钟)
    dehumidify_runtime INTEGER DEFAULT 0, -- 除湿运行时间(分钟)
    power_on_count INTEGER DEFAULT 0, -- 开机次数
    power_off_count INTEGER DEFAULT 0, -- 关机次数
    avg_temp DECIMAL(4,1), -- 平均温度
    min_temp DECIMAL(4,1), -- 最低温度
    max_temp DECIMAL(4,1), -- 最高温度
    energy_consumption DECIMAL(10,2), -- 能耗(kWh)
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, unit_id, date)
);

-- 5. 多联机分组表
CREATE TABLE IF NOT EXISTS multi_unit_ac_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_name VARCHAR(100) NOT NULL,
    description TEXT,
    group_type VARCHAR(20) DEFAULT 'custom', -- system, custom
    settings JSONB DEFAULT '{}',
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 多联机分组成员表
CREATE TABLE IF NOT EXISTS multi_unit_ac_group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES multi_unit_ac_groups(id) ON DELETE CASCADE,
    host_id UUID REFERENCES multi_unit_ac_hosts(id) ON DELETE CASCADE,
    unit_id UUID REFERENCES multi_unit_ac_indoor_units(id) ON DELETE CASCADE,
    member_type VARCHAR(20) NOT NULL, -- host, unit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, host_id, unit_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_hosts_device_id ON multi_unit_ac_hosts(device_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_hosts_tenant_id ON multi_unit_ac_hosts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_hosts_status ON multi_unit_ac_hosts(host_status);

CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_indoor_units_host_id ON multi_unit_ac_indoor_units(host_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_indoor_units_unit_id ON multi_unit_ac_indoor_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_indoor_units_status ON multi_unit_ac_indoor_units(unit_status);

CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_control_logs_host_id ON multi_unit_ac_control_logs(host_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_control_logs_unit_id ON multi_unit_ac_control_logs(unit_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_control_logs_created_at ON multi_unit_ac_control_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_control_logs_tenant_id ON multi_unit_ac_control_logs(tenant_id);

CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_runtime_stats_host_id ON multi_unit_ac_runtime_stats(host_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_runtime_stats_unit_id ON multi_unit_ac_runtime_stats(unit_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_runtime_stats_date ON multi_unit_ac_runtime_stats(date);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_runtime_stats_tenant_id ON multi_unit_ac_runtime_stats(tenant_id);

CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_groups_tenant_id ON multi_unit_ac_groups(tenant_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_group_members_group_id ON multi_unit_ac_group_members(group_id);

-- 添加注释
COMMENT ON TABLE multi_unit_ac_hosts IS '多联机主机表';
COMMENT ON TABLE multi_unit_ac_indoor_units IS '多联机内机表';
COMMENT ON TABLE multi_unit_ac_control_logs IS '多联机控制日志表';
COMMENT ON TABLE multi_unit_ac_runtime_stats IS '多联机运行统计表';
COMMENT ON TABLE multi_unit_ac_groups IS '多联机分组表';
COMMENT ON TABLE multi_unit_ac_group_members IS '多联机分组成员表';

COMMENT ON COLUMN multi_unit_ac_hosts.operation_mode IS '运行模式: 0=自动, 1=制冷, 2=制热, 3=送风, 4=除湿';
COMMENT ON COLUMN multi_unit_ac_indoor_units.operation_mode IS '运行模式: 0=自动, 1=制冷, 2=制热, 3=送风, 4=除湿';
COMMENT ON COLUMN multi_unit_ac_indoor_units.fan_speed IS '风速: 0=自动, 1=低速, 2=中速, 3=高速';
COMMENT ON COLUMN multi_unit_ac_indoor_units.swing_mode IS '摆风模式: 0=关闭, 1=上下, 2=左右, 3=全方位';