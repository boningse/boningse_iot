-- 创建多联机主机表
CREATE TABLE IF NOT EXISTS multi_unit_ac_hosts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    imei VARCHAR(50) UNIQUE,
    group_name VARCHAR(100),
    is_on BOOLEAN DEFAULT false,
    mode VARCHAR(20) DEFAULT 'cool', -- cool, heat, fan, auto
    current_temperature DECIMAL(4,2),
    outdoor_temperature DECIMAL(4,2),
    power_consumption DECIMAL(8,2) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'offline', -- online, offline, error
    last_online TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建多联机内机表
CREATE TABLE IF NOT EXISTS multi_unit_ac_indoor_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES multi_unit_ac_hosts(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    unit_number INTEGER NOT NULL,
    is_on BOOLEAN DEFAULT false,
    current_temperature DECIMAL(4,2),
    target_temperature DECIMAL(4,2) DEFAULT 24,
    fan_speed VARCHAR(20) DEFAULT 'auto', -- auto, low, medium, high
    mode VARCHAR(20) DEFAULT 'cool', -- cool, heat, fan, auto
    status VARCHAR(20) DEFAULT 'offline', -- online, offline, error
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, unit_number)
);

-- 创建多联机运行统计表
CREATE TABLE IF NOT EXISTS multi_unit_ac_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    host_id UUID REFERENCES multi_unit_ac_hosts(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    runtime_minutes INTEGER DEFAULT 0,
    power_consumption DECIMAL(8,2) DEFAULT 0,
    avg_temperature DECIMAL(4,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(host_id, date)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_hosts_device_id ON multi_unit_ac_hosts(device_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_hosts_status ON multi_unit_ac_hosts(status);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_indoor_units_host_id ON multi_unit_ac_indoor_units(host_id);
CREATE INDEX IF NOT EXISTS idx_multi_unit_ac_stats_host_id_date ON multi_unit_ac_stats(host_id, date);

-- 启用行级安全策略
ALTER TABLE multi_unit_ac_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_unit_ac_indoor_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE multi_unit_ac_stats ENABLE ROW LEVEL SECURITY;

-- 创建RLS策略
-- 多联机主机表策略
CREATE POLICY "Users can view multi unit ac hosts" ON multi_unit_ac_hosts
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert multi unit ac hosts" ON multi_unit_ac_hosts
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update multi unit ac hosts" ON multi_unit_ac_hosts
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete multi unit ac hosts" ON multi_unit_ac_hosts
    FOR DELETE USING (auth.role() = 'authenticated');

-- 多联机内机表策略
CREATE POLICY "Users can view indoor units" ON multi_unit_ac_indoor_units
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert indoor units" ON multi_unit_ac_indoor_units
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update indoor units" ON multi_unit_ac_indoor_units
    FOR UPDATE USING (auth.role() = 'authenticated');

CREATE POLICY "Users can delete indoor units" ON multi_unit_ac_indoor_units
    FOR DELETE USING (auth.role() = 'authenticated');

-- 多联机统计表策略
CREATE POLICY "Users can view multi unit ac stats" ON multi_unit_ac_stats
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert multi unit ac stats" ON multi_unit_ac_stats
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update multi unit ac stats" ON multi_unit_ac_stats
    FOR UPDATE USING (auth.role() = 'authenticated');

-- 授予权限
GRANT ALL PRIVILEGES ON multi_unit_ac_hosts TO authenticated;
GRANT ALL PRIVILEGES ON multi_unit_ac_indoor_units TO authenticated;
GRANT ALL PRIVILEGES ON multi_unit_ac_stats TO authenticated;

GRANT SELECT ON multi_unit_ac_hosts TO anon;
GRANT SELECT ON multi_unit_ac_indoor_units TO anon;
GRANT SELECT ON multi_unit_ac_stats TO anon;

-- 创建更新时间触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 为主机表创建更新时间触发器
CREATE TRIGGER update_multi_unit_ac_hosts_updated_at
    BEFORE UPDATE ON multi_unit_ac_hosts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 为内机表创建更新时间触发器
CREATE TRIGGER update_multi_unit_ac_indoor_units_updated_at
    BEFORE UPDATE ON multi_unit_ac_indoor_units
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();