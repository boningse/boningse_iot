# 电表数据聚合存储功能

## 功能概述

本功能实现了在一个轮询周期内收集所有寄存器数据，等待所有响应完成后，将数据合并为一条记录存储的需求。这样可以确保同一块电表在同一个轮询周期内的所有数据都被统一处理和存储，提高数据的一致性和完整性。

## 核心特性

### 1. 轮询会话管理
- 为每个电表的轮询周期创建独立的会话
- 会话ID格式：`{设备ID}_{电表ID}_{时间戳}`
- 支持并发处理多个电表的轮询会话
- 自动处理会话冲突（强制完成旧会话）

### 2. 数据收集与聚合
- 收集轮询周期内所有Modbus命令的响应数据
- 将原始数据和解析后的数据分别存储
- 实时跟踪命令完成状态
- 自动合并所有解析后的数据

### 3. 会话完成检测
- 智能检测所有预期命令是否已完成
- 自动触发数据聚合和存储流程
- 计算轮询耗时和数据完整性

### 4. 超时处理机制
- 默认30秒会话超时时间
- 超时后自动完成会话并保存已收集的数据
- 定期清理过期会话（每10秒）

### 5. 数据质量评估
- 计算数据完整性百分比
- 记录轮询耗时
- 统计完成的命令数量
- 提供数据质量分数

## 文件结构

```
backend/services/
├── electricMeterDataAggregator.js    # 数据聚合器核心类
└── electricMeterMqttService.js       # MQTT服务（已集成聚合功能）

test_data_aggregation_simple.js      # 简化版功能测试
```

## 核心类：ElectricMeterDataAggregator

### 主要方法

#### `startPollingSession(device, electricMeter, expectedCommands)`
启动新的轮询会话
- **参数**：
  - `device`: 设备对象
  - `electricMeter`: 电表对象
  - `expectedCommands`: 预期的Modbus命令列表
- **返回值**: 会话ID字符串

#### `addDataToSession(device, electricMeter, commandInfo, rawData, parsedData)`
添加接收到的数据到会话
- **参数**：
  - `device`: 设备对象
  - `electricMeter`: 电表对象
  - `commandInfo`: 命令信息（功能码、起始地址、数量）
  - `rawData`: 原始响应数据
  - `parsedData`: 解析后的数据
- **返回值**: boolean（true表示成功添加到会话，false表示应直接保存）

#### `getSessionStats()`
获取会话统计信息
- **返回值**: 包含活动会话数和详细信息的对象

#### `setDataAggregationEnabled(enabled)`
启用或禁用数据聚合功能
- **参数**: `enabled` - boolean值

## 集成到MQTT服务

### 修改点

1. **构造函数初始化**
```javascript
this.dataAggregator = new ElectricMeterDataAggregator();
this.enableDataAggregation = true;
```

2. **轮询开始时创建会话**
```javascript
// 在 pollSingleElectricMeter 方法中
if (this.enableDataAggregation && useRtuFormat && rtuCommands.length > 0) {
  const sessionId = this.dataAggregator.startPollingSession(device, electricMeter, optimizedQueries);
  // ...
}
```

3. **数据接收时添加到会话**
```javascript
// 在 handleElectricMeterData 方法中
if (this.enableDataAggregation && data.command_info) {
  const addedToSession = this.dataAggregator.addDataToSession(
    device, electricMeter, data.command_info, data, parsedData
  );
  
  if (!addedToSession) {
    // 直接保存数据
    await this.saveElectricMeterData(device, electricMeter, parsedData, data);
  }
}
```

## 聚合数据格式

聚合后的数据包含以下字段：

```javascript
{
  // 所有解析后的电表数据字段
  phase_a_voltage: 220.0,
  phase_b_voltage: 221.0,
  phase_c_voltage: 219.0,
  total_active_energy: 1234.5,
  // ...
  
  // 聚合元数据
  timestamp: "2025-07-21T15:17:44.667Z",
  session_id: "device-001_meter-001_1753111064661",
  polling_duration: 5000,           // 轮询耗时（毫秒）
  completed_commands: 3,            // 完成的命令数
  total_commands: 3,                // 总命令数
  data_completeness: "100.00%"      // 数据完整性百分比
}
```

## 使用示例

### 1. 启用数据聚合
```javascript
const electricMeterService = new ElectricMeterMqttService();

// 启用数据聚合（默认已启用）
electricMeterService.setDataAggregationEnabled(true);

// 开始轮询
electricMeterService.startAllElectricMeterPolling();
```

### 2. 获取聚合统计
```javascript
const stats = electricMeterService.getDataAggregationStats();
console.log(`活动会话数: ${stats.totalSessions}`);
```

### 3. 禁用数据聚合
```javascript
// 禁用聚合功能，恢复原有的即时保存模式
electricMeterService.setDataAggregationEnabled(false);
```

## 测试验证

运行测试文件验证功能：

```bash
# 运行简化版测试
node test_data_aggregation_simple.js

# 运行完整版测试（需要数据库环境）
node test_data_aggregation.js
```

测试覆盖场景：
- ✅ 轮询会话管理
- ✅ 数据收集和聚合
- ✅ 会话完成检测
- ✅ 超时处理机制
- ✅ 并发会话支持
- ✅ 数据质量评估
- ✅ 聚合数据存储

## 性能优化

### 1. 内存管理
- 使用Map数据结构高效管理会话
- 及时清理完成和过期的会话
- 定期执行垃圾回收

### 2. 并发处理
- 支持多个电表同时轮询
- 每个会话独立处理，互不干扰
- 异步数据保存，不阻塞轮询流程

### 3. 错误处理
- 优雅处理会话超时
- 自动恢复异常状态
- 详细的错误日志记录

## 配置参数

可通过修改 `ElectricMeterDataAggregator` 构造函数调整以下参数：

```javascript
this.sessionTimeout = 30000;      // 会话超时时间（毫秒）
this.cleanupInterval = 10000;      // 清理间隔（毫秒）
```

## 注意事项

1. **数据一致性**: 聚合功能确保同一轮询周期的数据具有相同的时间戳
2. **超时处理**: 如果部分命令响应丢失，会在超时后保存已收集的数据
3. **向下兼容**: 当聚合功能禁用时，系统自动回退到原有的即时保存模式
4. **资源清理**: 服务停止时会自动清理所有活动会话

## 故障排除

### 常见问题

1. **会话未完成**: 检查是否所有预期命令都有响应
2. **数据重复**: 确保没有重复发送相同的命令
3. **内存泄漏**: 定期检查活动会话数量，确保及时清理

### 调试方法

```javascript
// 获取详细的会话统计
const stats = aggregator.getSessionStats();
console.log('活动会话:', stats.sessions);

// 检查特定会话状态
const session = aggregator.pollingSessions.get('device_meter_key');
if (session) {
  console.log('会话详情:', {
    sessionId: session.sessionId,
    completedCommands: session.expectedCommands.filter(cmd => cmd.completed).length,
    totalCommands: session.expectedCommands.length
  });
}
```

## 未来扩展

1. **数据压缩**: 对聚合数据进行压缩存储
2. **批量写入**: 支持多个电表数据的批量数据库写入
3. **数据分析**: 基于聚合数据进行实时分析和告警
4. **配置化**: 支持通过配置文件调整聚合参数