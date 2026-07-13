-- 创建照明设备定时表
CREATE TABLE IF NOT EXISTS lighting_device_timers (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(100) NOT NULL,  -- 设备ID/IMEI
  name VARCHAR(100),                -- 定时名称
  action VARCHAR(20) NOT NULL,      -- 动作类型：on/off
  time TIME NOT NULL,               -- 执行时间
  repeat TEXT[] DEFAULT '{}',       -- 重复日期（周一到周日）
  enabled BOOLEAN DEFAULT TRUE,     -- 是否启用
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_lighting_device_timers_device_id ON lighting_device_timers(device_id);
CREATE INDEX IF NOT EXISTS idx_lighting_device_timers_time ON lighting_device_timers(time);
CREATE INDEX IF NOT EXISTS idx_lighting_device_timers_enabled ON lighting_device_timers(enabled);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_lighting_device_timers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_lighting_device_timers_updated_at ON lighting_device_timers;
CREATE TRIGGER update_lighting_device_timers_updated_at
BEFORE UPDATE ON lighting_device_timers
FOR EACH ROW
EXECUTE FUNCTION update_lighting_device_timers_updated_at();