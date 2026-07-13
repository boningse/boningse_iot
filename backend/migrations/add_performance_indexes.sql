-- 数据库性能优化索引迁移脚本
-- 执行时间：根据数据量大小，可能需要几分钟到几小时
-- 建议在低峰期执行

-- 开始事务
BEGIN;

-- 为 users 表添加性能索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_id_status ON users(tenant_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_last_login_at ON users(last_login_at);

-- 为 tenants 表添加性能索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_status ON tenants(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_type ON tenants(type);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenants_expire_date ON tenants(expire_date);

-- 为 manufacturers 表添加性能索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manufacturers_status ON manufacturers(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_manufacturers_subscription_type ON manufacturers(subscription_type);

-- 为 mqtt_configs 表添加性能索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mqtt_configs_tenant_id_status ON mqtt_configs(tenant_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mqtt_configs_status ON mqtt_configs(status);

-- 为 message_processing_stats 表添加复合索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_msg_stats_device_received ON message_processing_stats(device_id, received_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_msg_stats_processing_status ON message_processing_stats(processing_status, received_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_msg_stats_storage_status ON message_processing_stats(storage_status, received_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_msg_stats_anomaly ON message_processing_stats(has_anomaly, anomaly_severity);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_msg_stats_direction_type ON message_processing_stats(direction, message_type);

-- 为 device_data 表添加分区索引（如果使用分区表）
-- 注意：这些索引对于大数据量的时间序列数据非常重要
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_data_tenant_time ON device_data(device_id, timestamp DESC) WHERE timestamp >= NOW() - INTERVAL '30 days';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_data_quality_time ON device_data(quality, timestamp) WHERE quality < 100;

-- 为 device_logs 表添加性能索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_logs_level_time ON device_logs(level, timestamp DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_logs_device_level ON device_logs(device_id, level, timestamp DESC);

-- 为 device_commands 表添加复合索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_commands_device_time ON device_commands(device_id, created_at DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_commands_status_time ON device_commands(status, created_at DESC);

-- 为 electric_meters 表添加复合索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_electric_meters_tenant_type ON electric_meters(tenant_id, meter_type, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_electric_meters_device_status ON electric_meters(device_id, status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_electric_meters_dtu_status ON electric_meters(dtu_device_id, status) WHERE dtu_device_id IS NOT NULL;

-- 为经常查询的 JSON 字段添加 GIN 索引
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_mqtt_config_gin ON devices USING GIN (mqtt_config);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_devices_connection_config_gin ON devices USING GIN (connection_config);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_protocol_configs_modbus_config_gin ON protocol_configs USING GIN (modbus_config);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_protocol_configs_registers_gin ON protocol_configs USING GIN (modbus_registers);

-- 为 device_data 的 payload 字段添加 GIN 索引（谨慎使用，会占用大量空间）
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_device_data_payload_gin ON device_data USING GIN (payload);

-- 提交事务
COMMIT;

-- 更新表统计信息
ANALYZE users;
ANALYZE tenants;
ANALYZE devices;
ANALYZE device_data;
ANALYZE device_commands;
ANALYZE device_logs;
ANALYZE electric_meters;
ANALYZE manufacturers;
ANALYZE mqtt_configs;
ANALYZE protocol_configs;
ANALYZE message_processing_stats;

-- 输出索引创建完成信息
SELECT 'Performance indexes created successfully!' as status;

-- 查看索引使用情况的查询（可选）
/*
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE schemaname = 'public'
ORDER BY idx_tup_read DESC;
*/