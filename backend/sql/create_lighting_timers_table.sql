-- 创建照明设备定时表
CREATE TABLE IF NOT EXISTS lighting_device_timers (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  name VARCHAR(100),
  action VARCHAR(20) NOT NULL,
  time VARCHAR(10) NOT NULL,
  repeat TEXT[] DEFAULT '{}',
  enabled BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);