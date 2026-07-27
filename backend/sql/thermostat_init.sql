-- 温控器设备管理系统数据库初始化脚本
-- 创建时间: 2024-01-15
-- 说明: 创建温控器相关的数据库表结构、索引、触发器和初始化数据

-- ============================================
-- 1. 温控器分组表 (thermostat_groups)
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_groups (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(name, tenant_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_thermostat_groups_tenant_id ON thermostat_groups(tenant_id);

-- ============================================
-- 2. 温控器属性表 (thermostat_properties)
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_properties (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) UNIQUE,
    group_id BIGINT REFERENCES thermostat_groups(id),
    
    -- 设备状态
    power_status BOOLEAN DEFAULT false,
    
    -- 温度控制
    current_temperature DECIMAL(4,1),
    target_temp DECIMAL(4,1) DEFAULT 24.0 CHECK (target_temp >= 16 AND target_temp <= 30),
    temp_locked BOOLEAN DEFAULT false,
    
    -- 风速控制 (0-自动, 1-低速, 2-中速, 3-高速)
    fan_speed INTEGER DEFAULT 1 CHECK (fan_speed >= 0 AND fan_speed <= 3),
    
    -- 空调模式
    ac_mode VARCHAR(20) DEFAULT 'cool' CHECK (ac_mode IN ('cool', 'heat', 'dehumidify', 'fan')),
    
    -- 运行时间统计 (秒)
    runtime_speed1 BIGINT DEFAULT 0,
    runtime_speed2 BIGINT DEFAULT 0,
    runtime_speed3 BIGINT DEFAULT 0,
    
    last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_thermostat_properties_device_id ON thermostat_properties(device_id);
CREATE INDEX IF NOT EXISTS idx_thermostat_properties_group_id ON thermostat_properties(group_id);
CREATE INDEX IF NOT EXISTS idx_thermostat_properties_power_status ON thermostat_properties(power_status);

-- ============================================
-- 3. 开关机计划表 (thermostat_schedules)
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_schedules (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id),
    
    -- 计划动作 (on-开机, off-关机)
    action VARCHAR(10) NOT NULL CHECK (action IN ('on', 'off')),
    
    -- 执行时间 (HH:MM格式)
    execute_time TIME NOT NULL,
    
    -- 重复设置 (daily, weekly, weekdays, weekends, once)
    repeat_type VARCHAR(20) DEFAULT 'daily' CHECK (repeat_type IN ('daily', 'weekly', 'weekdays', 'weekends', 'once')),
    
    -- 星期设置 (用于weekly类型，位掩码：1=周一, 2=周二, 4=周三, 8=周四, 16=周五, 32=周六, 64=周日)
    week_days INTEGER DEFAULT 127, -- 默认每天 (1+2+4+8+16+32+64=127)
    
    -- 计划状态
    enabled BOOLEAN DEFAULT true,
    
    -- 执行日期 (用于once类型)
    execute_date DATE,
    
    -- 附加设置 (开机时的温度、风速等)
    target_temp DECIMAL(4,1),
    fan_speed INTEGER CHECK (fan_speed >= 0 AND fan_speed <= 3),
    ac_mode VARCHAR(20) CHECK (ac_mode IN ('cool', 'heat', 'dehumidify', 'fan')),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_thermostat_schedules_device_id ON thermostat_schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_thermostat_schedules_enabled ON thermostat_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_thermostat_schedules_execute_time ON thermostat_schedules(execute_time);

-- ============================================
-- 4. 运行时间统计表 (thermostat_runtime_stats)
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_runtime_stats (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id),
    
    -- 统计日期
    stat_date DATE NOT NULL,
    
    -- 各风速运行时间 (秒)
    runtime_speed1 BIGINT DEFAULT 0,
    runtime_speed2 BIGINT DEFAULT 0,
    runtime_speed3 BIGINT DEFAULT 0,
    
    -- 总运行时间
    total_runtime BIGINT GENERATED ALWAYS AS (runtime_speed1 + runtime_speed2 + runtime_speed3) STORED,
    
    -- 各模式运行时间
    runtime_cool BIGINT DEFAULT 0,
    runtime_heat BIGINT DEFAULT 0,
    runtime_dehumidify BIGINT DEFAULT 0,
    runtime_fan BIGINT DEFAULT 0,
    
    -- 开关机次数
    power_on_count INTEGER DEFAULT 0,
    power_off_count INTEGER DEFAULT 0,
    
    -- 平均温度
    avg_current_temp DECIMAL(4,1),
    avg_target_temp DECIMAL(4,1),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(device_id, stat_date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_thermostat_runtime_stats_device_id ON thermostat_runtime_stats(device_id);
CREATE INDEX IF NOT EXISTS idx_thermostat_runtime_stats_stat_date ON thermostat_runtime_stats(stat_date);
CREATE INDEX IF NOT EXISTS idx_thermostat_runtime_stats_total_runtime ON thermostat_runtime_stats(total_runtime DESC);

-- ============================================
-- 5. 设备控制日志表 (thermostat_control_logs)
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_control_logs (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id),
    
    -- 控制类型
    control_type VARCHAR(30) NOT NULL CHECK (control_type IN (
        'power_on', 'power_off', 'temp_change', 'fan_speed_change', 
        'mode_change', 'temp_lock', 'temp_unlock', 'scene_control'
    )),
    
    -- 控制前的值
    old_value JSONB,
    
    -- 控制后的值
    new_value JSONB,
    
    -- 控制来源 (manual-手动, schedule-计划, scene-情景)
    control_source VARCHAR(20) DEFAULT 'manual' CHECK (control_source IN ('manual', 'schedule', 'scene')),
    
    -- 操作用户
    user_id UUID REFERENCES users(id),
    
    -- 控制结果
    success BOOLEAN DEFAULT true,
    error_message TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_thermostat_control_logs_device_id ON thermostat_control_logs(device_id);
CREATE INDEX IF NOT EXISTS idx_thermostat_control_logs_control_type ON thermostat_control_logs(control_type);
CREATE INDEX IF NOT EXISTS idx_thermostat_control_logs_created_at ON thermostat_control_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_thermostat_control_logs_user_id ON thermostat_control_logs(user_id);

-- ============================================
-- 6. 情景模式表 (thermostat_scenes)
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_scenes (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- 情景类型 (system-系统预设, custom-用户自定义)
    scene_type VARCHAR(20) DEFAULT 'custom' CHECK (scene_type IN ('system', 'custom')),
    
    -- 情景配置 (JSON格式存储各种设置)
    scene_config JSONB NOT NULL,
    
    -- 是否启用
    enabled BOOLEAN DEFAULT true,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(name, tenant_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_thermostat_scenes_tenant_id ON thermostat_scenes(tenant_id);
CREATE INDEX IF NOT EXISTS idx_thermostat_scenes_scene_type ON thermostat_scenes(scene_type);

-- ============================================
-- 7. 触发器和函数
-- ============================================

-- 创建更新时间戳函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为各表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_thermostat_properties_updated_at ON thermostat_properties;
CREATE TRIGGER update_thermostat_properties_updated_at 
    BEFORE UPDATE ON thermostat_properties 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_thermostat_groups_updated_at ON thermostat_groups;
CREATE TRIGGER update_thermostat_groups_updated_at 
    BEFORE UPDATE ON thermostat_groups 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_thermostat_schedules_updated_at ON thermostat_schedules;
CREATE TRIGGER update_thermostat_schedules_updated_at 
    BEFORE UPDATE ON thermostat_schedules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_thermostat_runtime_stats_updated_at ON thermostat_runtime_stats;
CREATE TRIGGER update_thermostat_runtime_stats_updated_at 
    BEFORE UPDATE ON thermostat_runtime_stats 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_thermostat_scenes_updated_at ON thermostat_scenes;
CREATE TRIGGER update_thermostat_scenes_updated_at 
    BEFORE UPDATE ON thermostat_scenes 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. 权限设置
-- ============================================

-- 为postgres用户授权
GRANT ALL PRIVILEGES ON thermostat_properties TO postgres;
GRANT ALL PRIVILEGES ON thermostat_groups TO postgres;
GRANT ALL PRIVILEGES ON thermostat_schedules TO postgres;
GRANT ALL PRIVILEGES ON thermostat_runtime_stats TO postgres;
GRANT ALL PRIVILEGES ON thermostat_control_logs TO postgres;
GRANT ALL PRIVILEGES ON thermostat_scenes TO postgres;

-- 为序列授权
GRANT ALL PRIVILEGES ON SEQUENCE thermostat_properties_id_seq TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE thermostat_groups_id_seq TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE thermostat_schedules_id_seq TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE thermostat_runtime_stats_id_seq TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE thermostat_control_logs_id_seq TO postgres;
GRANT ALL PRIVILEGES ON SEQUENCE thermostat_scenes_id_seq TO postgres;

COMMIT;

-- 脚本执行完成
SELECT 'Thermostat database initialization completed successfully!' as result;
