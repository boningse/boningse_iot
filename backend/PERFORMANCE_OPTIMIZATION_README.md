# IoT系统性能优化指南

本文档详细介绍了IoT后端系统的性能优化功能和配置。

## 🚀 优化概览

### 已实施的优化

1. **数据库优化**
   - 连接池优化配置
   - 索引优化
   - 查询性能优化
   - 分区表建议

2. **缓存优化**
   - Redis + 内存双层缓存
   - 智能缓存策略
   - 缓存预热和清理

3. **MQTT服务优化**
   - 动态重连策略
   - 连接池管理
   - 消息处理优化

4. **WebSocket优化**
   - 连接限制和管理
   - 心跳检测优化
   - 租户级别连接控制

5. **电表数据采集优化**
   - 动态轮询间隔
   - 设备优先级队列
   - 错误处理和重试机制

6. **性能监控**
   - 实时性能指标收集
   - 智能警报系统
   - 性能报告生成

## 📊 性能监控

### 监控指标

- **系统指标**: CPU使用率、内存使用率、负载平均值
- **应用指标**: 进程内存、事件循环延迟
- **数据库指标**: 连接池状态、查询响应时间
- **缓存指标**: 命中率、内存使用情况
- **MQTT指标**: 连接数、消息处理速度
- **WebSocket指标**: 连接数、租户分布

### 警报阈值

```javascript
{
  cpu: { warning: 70%, critical: 85% },
  memory: { warning: 75%, critical: 90% },
  responseTime: { warning: 1000ms, critical: 3000ms },
  errorRate: { warning: 2%, critical: 5% }
}
```

### 监控端点

- `GET /health` - 基础健康检查 + 性能概览
- `GET /api/system/performance` - 详细性能报告

## 🗄️ 数据库优化

### 索引优化

执行以下SQL脚本应用数据库索引优化：

```bash
psql -d your_database -f migrations/add_performance_indexes.sql
```

### 主要索引

1. **设备表 (devices)**
   - `(tenant_id, status)` - 租户设备状态查询
   - `(device_id)` - 设备ID查询
   - `(imei)` - IMEI查询
   - `(last_seen_at)` - 设备在线状态

2. **设备数据表 (device_data)**
   - `(device_id, timestamp DESC)` - 时间序列查询
   - `(device_id, data_type, timestamp)` - 数据类型查询
   - `(quality, timestamp)` - 数据质量查询

3. **电表表 (electric_meters)**
   - `(tenant_id, status)` - 租户电表状态
   - `(dtu_device_id)` - DTU设备关联
   - `(meter_number)` - 电表编号查询

### 连接池配置

```javascript
// 生产环境
{
  max: 50,        // 最大连接数
  min: 10,        // 最小连接数
  acquire: 30000, // 获取连接超时
  idle: 5000      // 空闲超时
}
```

## 🔄 缓存策略

### 缓存层级

1. **Redis缓存** (长期数据)
   - 设备配置
   - 用户会话
   - 系统配置

2. **内存缓存** (短期数据)
   - API响应
   - 设备数据
   - 临时计算结果

### 缓存配置

```javascript
const cacheStrategies = {
  device: { ttl: 3600, useRedis: true },      // 1小时
  session: { ttl: 1800, useRedis: true },    // 30分钟
  api: { ttl: 300, useRedis: false },        // 5分钟
  deviceData: { ttl: 60, useRedis: false }   // 1分钟
};
```

### 使用示例

```javascript
const { cacheManager } = require('./config/cache-config');

// 设置缓存
await cacheManager.set('device:123', deviceData, 'device');

// 获取缓存
const data = await cacheManager.get('device:123', 'device');

// 删除缓存
await cacheManager.del('device:123', 'device');
```

## 📡 MQTT优化

### 连接优化

- **最大重连次数**: 50次
- **重连间隔**: 指数退避 (1s → 60s)
- **保持连接**: 60秒心跳
- **清理会话**: 禁用 (保持订阅)

### 消息处理

- **批处理**: 100条消息/批次
- **并发处理**: CPU核心数 × 2
- **重试机制**: 3次重试
- **队列管理**: 高水位线 8000，低水位线 2000

## 🌐 WebSocket优化

### 连接限制

- **全局连接数**: 1000 (可配置)
- **租户连接数**: 100 (可配置)
- **心跳间隔**: 60秒
- **最大负载**: 16MB

### 连接管理

```javascript
// 连接统计
const stats = websocketService.getStats();
console.log({
  totalConnections: stats.totalConnections,
  connectionsByTenant: stats.connectionsByTenant
});
```

## ⚡ 电表数据采集优化

### 动态轮询

- **基础间隔**: 30秒
- **快速间隔**: 10秒 (高优先级设备)
- **慢速间隔**: 120秒 (低优先级设备)
- **错误阈值**: 3次连续错误降级
- **成功阈值**: 5次连续成功升级

### 设备优先级

```javascript
// 设备优先级队列
const priorities = {
  high: [],    // 关键设备
  normal: [],  // 普通设备
  low: []      // 非关键设备
};
```

## 📈 性能监控使用

### 启动监控

```javascript
const { performanceMonitor } = require('./services/performanceMonitorService');

// 启动监控
performanceMonitor.start();

// 监听警报
performanceMonitor.on('alert', (alert) => {
  console.log('性能警报:', alert);
});
```

### 获取指标

```javascript
// 获取当前指标
const metrics = performanceMonitor.getMetrics();

// 生成报告
const report = performanceMonitor.generateReport();

// 获取警报历史
const alerts = performanceMonitor.getAlertHistory(20);
```

### 自定义阈值

```javascript
// 更新阈值
performanceMonitor.updateThresholds({
  cpu: 75,
  memory: 80,
  responseTime: 2000
});
```

## 🔧 配置文件

### 环境变量

```bash
# 数据库连接池
DB_MAX_CONNECTIONS=50
DB_MIN_CONNECTIONS=10

# Redis配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_ENABLED=true

# 性能监控
PERFORMANCE_MONITORING=true
ALERT_THRESHOLD_CPU=80
ALERT_THRESHOLD_MEMORY=85
```

### 配置文件位置

- `config/optimization.js` - 主要优化配置
- `config/cache-config.js` - 缓存配置
- `config/database-pool.js` - 数据库连接池配置
- `services/performanceMonitorService.js` - 性能监控服务

## 📋 性能检查清单

### 日常监控

- [ ] 检查CPU使用率 < 70%
- [ ] 检查内存使用率 < 80%
- [ ] 检查数据库连接池使用率 < 80%
- [ ] 检查缓存命中率 > 80%
- [ ] 检查API响应时间 < 1秒
- [ ] 检查MQTT连接稳定性
- [ ] 检查WebSocket连接数

### 定期优化

- [ ] 每周执行数据库VACUUM ANALYZE
- [ ] 每月检查慢查询日志
- [ ] 每月更新索引统计信息
- [ ] 每季度评估分区策略
- [ ] 每季度检查缓存策略效果

### 扩容指标

- [ ] CPU使用率持续 > 70%
- [ ] 内存使用率持续 > 80%
- [ ] 数据库连接池经常满载
- [ ] API响应时间持续 > 2秒
- [ ] WebSocket连接数接近限制

## 🚨 故障排除

### 常见问题

1. **高CPU使用率**
   - 检查慢查询
   - 优化算法复杂度
   - 考虑增加缓存

2. **高内存使用率**
   - 检查内存泄漏
   - 优化缓存大小
   - 增加垃圾回收频率

3. **数据库连接池耗尽**
   - 检查长时间运行的查询
   - 优化事务处理
   - 增加连接池大小

4. **缓存命中率低**
   - 调整TTL设置
   - 优化缓存键策略
   - 实施缓存预热

### 日志分析

```bash
# 查看性能警报
grep "性能警报" logs/app.log

# 查看数据库连接
grep "Database Pool" logs/app.log

# 查看缓存统计
grep "Cache" logs/app.log
```

## 📞 支持

如有性能问题或优化建议，请：

1. 检查监控指标和警报
2. 查看相关日志文件
3. 运行性能报告
4. 联系技术支持团队

---

**注意**: 所有性能优化配置都会根据系统硬件自动调整。在生产环境中部署前，请先在测试环境中验证配置。