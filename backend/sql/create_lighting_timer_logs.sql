-- 创建照明设备定时任务执行日志表
CREATE TABLE IF NOT EXISTS lighting_timer_logs (
  id SERIAL PRIMARY KEY,
  timer_id INTEGER NOT NULL REFERENCES lighting_device_timers(id) ON DELETE CASCADE,
  success BOOLEAN NOT NULL DEFAULT TRUE,
  error_message TEXT,
  executed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_lighting_timer_logs_timer_id ON lighting_timer_logs(timer_id);
CREATE INDEX IF NOT EXISTS idx_lighting_timer_logs_executed_at ON lighting_timer_logs(executed_at);