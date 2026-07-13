-- 更新温控器计划表以支持多设备和自定义日期功能
-- 创建时间: 2024-01-16
-- 说明: 修改thermostat_schedules表结构以支持前端新功能

-- ============================================
-- 1. 备份现有数据
-- ============================================
CREATE TABLE IF NOT EXISTS thermostat_schedules_backup AS 
SELECT * FROM thermostat_schedules;

-- ============================================
-- 2. 删除旧表并重新创建
-- ============================================
DROP TABLE IF EXISTS thermostat_schedules CASCADE;

-- ============================================
-- 3. 创建新的计划表结构
-- ============================================
CREATE TABLE thermostat_schedules (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id),
    
    -- 执行时间 (HH:MM格式)
    execute_time TIME NOT NULL,
    
    -- 重复设置 (once, daily, weekly, custom)
    repeat_type VARCHAR(20) DEFAULT 'once' CHECK (repeat_type IN ('once', 'daily', 'weekly', 'custom')),
    
    -- 星期设置 (用于weekly类型，数组格式：[1,2,3,4,5,6,0] 表示周一到周日)
    week_days INTEGER[] DEFAULT '{}',
    
    -- 自定义日期 (用于custom类型，日期数组)
    custom_dates DATE[] DEFAULT '{}',
    
    -- 开关机控制 (on, off, none)
    power_action VARCHAR(10) DEFAULT 'on' CHECK (power_action IN ('on', 'off', 'none')),
    
    -- 工作模式 (仅在开机时有效)
    ac_mode VARCHAR(20) CHECK (ac_mode IN ('cool', 'heat', 'fan', 'auto')),
    
    -- 目标温度 (仅在开机时有效)
    target_temp DECIMAL(4,1) CHECK (target_temp >= 16 AND target_temp <= 30),
    
    -- 风速档位 (仅在开机时有效)
    fan_speed VARCHAR(10) CHECK (fan_speed IN ('1', '2', '3', 'auto')),
    
    -- 计划状态
    enabled BOOLEAN DEFAULT true,
    
    -- 备注
    description TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. 创建计划设备关联表
-- ============================================
CREATE TABLE thermostat_schedule_devices (
    id BIGSERIAL PRIMARY KEY,
    schedule_id BIGINT NOT NULL REFERENCES thermostat_schedules(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(schedule_id, device_id)
);

-- ============================================
-- 5. 创建索引
-- ============================================
CREATE INDEX idx_thermostat_schedules_tenant_id ON thermostat_schedules(tenant_id);
CREATE INDEX idx_thermostat_schedules_enabled ON thermostat_schedules(enabled);
CREATE INDEX idx_thermostat_schedules_execute_time ON thermostat_schedules(execute_time);
CREATE INDEX idx_thermostat_schedules_repeat_type ON thermostat_schedules(repeat_type);

CREATE INDEX idx_thermostat_schedule_devices_schedule_id ON thermostat_schedule_devices(schedule_id);
CREATE INDEX idx_thermostat_schedule_devices_device_id ON thermostat_schedule_devices(device_id);

-- ============================================
-- 6. 创建触发器
-- ============================================
DROP TRIGGER IF EXISTS update_thermostat_schedules_updated_at ON thermostat_schedules;
CREATE TRIGGER update_thermostat_schedules_updated_at 
    BEFORE UPDATE ON thermostat_schedules 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 7. 插入测试数据
-- ============================================
INSERT INTO thermostat_schedules (
    name, tenant_id, execute_time, repeat_type, week_days, power_action, 
    ac_mode, target_temp, fan_speed, enabled, description
) VALUES 
(
    '工作日开机计划', 
    'c749c9ae-3298-4d39-9060-49938f354684', 
    '08:00', 
    'weekly', 
    '{1,2,3,4,5}', 
    'on', 
    'cool', 
    24, 
    'auto', 
    true, 
    '工作日早上8点自动开机制冷'
),
(
    '周末关机计划', 
    'c749c9ae-3298-4d39-9060-49938f354684', 
    '22:00', 
    'weekly', 
    '{6,0}', 
    'off', 
    null, 
    null, 
    null, 
    true, 
    '周末晚上10点自动关机'
),
(
    '夏季制冷计划', 
    'c749c9ae-3298-4d39-9060-49938f354684', 
    '14:00', 
    'daily', 
    '{}', 
    'on', 
    'cool', 
    22, 
    '2', 
    true, 
    '每天下午2点开启制冷模式'
);

COMMIT;