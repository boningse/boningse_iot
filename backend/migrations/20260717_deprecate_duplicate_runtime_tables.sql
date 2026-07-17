BEGIN;

INSERT INTO database_table_lifecycle (
  table_schema, table_name, lifecycle_status, owner_module, reason, marked_at, display_name
) VALUES
  ('public', 'device_data', 'pending_delete', 'legacy_unified_data',
   '四个控制模块已使用独立状态和电气时序表；2026-07-17停止通用重复写入及旧数据接口', NOW(), '旧通用设备数据'),
  ('public', 'message_processing_stats', 'pending_delete', 'legacy_message_tracking',
   '逐消息明细会产生多次数据库写入；2026-07-17改用MQTT内存统计并停止写入', NOW(), '旧消息处理明细'),
  ('public', 'message_flow_statistics', 'pending_delete', 'legacy_message_tracking',
   '依赖逐消息明细生成；系统看板已改用MQTT内存统计，停止新增数据', NOW(), '旧消息流聚合统计'),
  ('public', 'anomaly_detection_rules', 'pending_delete', 'legacy_message_tracking',
   '旧逐消息异常检测功能随消息明细停用，配置结构暂存待后续确认删除', NOW(), '旧消息异常检测规则'),
  ('public', 'device_logs', 'active', 'operations',
   '仅保留警告、错误及必要操作记录；不再重复保存正常MQTT遥测正文', NOW(), '设备异常及操作日志')
ON CONFLICT (table_schema, table_name) DO UPDATE SET
  lifecycle_status = EXCLUDED.lifecycle_status,
  owner_module = EXCLUDED.owner_module,
  reason = EXCLUDED.reason,
  marked_at = EXCLUDED.marked_at,
  display_name = EXCLUDED.display_name;

COMMENT ON TABLE device_data IS
  '已停用：四个控制模块数据由各自TimescaleDB时序表管理；2026-07-17停止写入。';
COMMENT ON TABLE message_processing_stats IS
  '已停用：逐消息处理明细改为MQTT内存统计；2026-07-17停止写入。';
COMMENT ON TABLE message_flow_statistics IS
  '已停用：系统看板改用MQTT实时内存统计；2026-07-17停止写入。';
COMMENT ON TABLE device_logs IS
  '设备异常及必要操作日志；正常遥测正文不再重复保存。';

COMMIT;
