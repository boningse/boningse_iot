# RTU命令重试机制实现说明

## 概述

针对用户反馈的电表号`865661075118854002`在发送命令`02 03 00 5A 00 03 25 EB`时首次可能收不到回复，需要重新发送的问题，我们实现了一套完整的RTU命令重试机制。

## 问题描述

- **电表号**: 865661075118854002
- **测试命令**: `02 03 00 5A 00 03 25 EB`
- **期望回复**: `0203 0601 2801 2101 2005 ec`
- **问题现象**: 第一次发送时可能收不到回复，但再发一次基本能收到信息回复
- **需求**: 对收不到回复或收到的信息不全时，自动重新下发指令，最多重复三次

## 解决方案

### 1. 核心功能实现

在`mqttService.js`中新增了以下核心方法：

#### 1.1 主要方法

- **`publishRTUCommandWithRetry()`**: 发布带重试功能的RTU命令
- **`sendRTUCommand()`**: 实际发送RTU命令
- **`setCommandTimeout()`**: 设置命令超时处理
- **`handleCommandTimeout()`**: 处理命令超时和重试逻辑
- **`markCommandResponseReceived()`**: 标记命令响应已收到
- **`cleanupCommand()`**: 清理命令资源
- **`getRetryCommandStats()`**: 获取重试统计信息

#### 1.2 配置参数

```javascript
// 重试机制配置
this.pendingRetryCommands = new Map(); // 待重试命令队列
this.commandTimeouts = new Map();       // 命令超时处理器
this.maxRetries = 3;                    // 最大重试次数
this.commandTimeout = 10000;            // 命令超时时间(10秒)
this.retryDelay = 2000;                 // 重试延迟时间(2秒)
```

### 2. 工作流程

```
1. 发送RTU命令
   ↓
2. 设置超时定时器(10秒)
   ↓
3. 等待响应
   ↓
4a. 收到响应 → 标记成功，清理资源
   ↓
4b. 超时无响应 → 检查重试次数
   ↓
5. 重试次数 < 3 → 延迟2秒后重新发送
   ↓
6. 重试次数 ≥ 3 → 标记最终失败
```

### 3. 集成修改

#### 3.1 mqttService.js 修改

在RTU响应解析部分添加了响应标记：

```javascript
// 标记命令响应已收到（重试机制）
this.markCommandResponseReceived(
  device.id,
  parsedResponse.slaveAddress,
  parsedResponse.functionCode,
  parsedResponse
);
```

#### 3.2 electricMeterMqttService.js 修改

将原有的直接MQTT发布替换为带重试机制的发送：

```javascript
// 使用带重试机制的RTU命令发送
const commandBuffer = ModbusRtuUtils.hexStringToBuffer(publishContent);
await this.mqttService.publishRTUCommandWithRetry(
  commandTopic,
  commandBuffer,
  device.id,
  parseInt(electricMeter.meter_address) || 1,
  rtuCommand.function_code,
  {
    description: rtuCommand.description || rtuCommand.register_names?.[0],
    commandIndex: commandIndex,
    totalCommands: totalCommands,
    hexCommand: publishContent
  }
);
```

### 4. 特性说明

#### 4.1 智能重试
- **最大重试次数**: 3次
- **超时时间**: 10秒
- **重试延迟**: 2秒
- **自动清理**: 成功或最终失败后自动清理资源

#### 4.2 状态跟踪
- 跟踪每个命令的发送状态
- 记录重试次数和时间
- 提供统计信息查询

#### 4.3 日志记录
- 详细记录每次发送和重试
- 记录超时和失败原因
- 提供调试信息

### 5. 使用方法

#### 5.1 自动使用

重试机制已集成到现有的电表轮询系统中，无需额外配置即可自动生效。

#### 5.2 手动测试

可以使用提供的测试脚本进行验证：

```bash
cd /mnt/mydisk/iot/backend
node test_rtu_retry_mechanism.js
```

#### 5.3 统计查询

可以通过以下方式获取重试统计：

```javascript
const stats = mqttService.getRetryCommandStats();
console.log('重试统计:', stats);
```

### 6. 监控和调试

#### 6.1 日志关键字

在日志中搜索以下关键字来监控重试机制：

- `RTU命令重试` - 重试相关日志
- `命令超时` - 超时处理日志
- `重试统计` - 统计信息日志
- `最终失败` - 最终失败日志

#### 6.2 实时监控

```bash
# 监控重试相关日志
tail -f app.log | grep "RTU命令重试\|命令超时\|重试统计"

# 监控特定电表的命令
tail -f app.log | grep "865661075118854002"
```

### 7. 配置调整

如需调整重试参数，可以修改`mqttService.js`中的配置：

```javascript
// 在mqttService.js构造函数中调整
this.maxRetries = 3;        // 最大重试次数
this.commandTimeout = 10000; // 超时时间(毫秒)
this.retryDelay = 2000;     // 重试延迟(毫秒)
```

### 8. 预期效果

实施重试机制后，预期能够解决以下问题：

1. **提高命令成功率**: 通过自动重试减少因网络波动导致的命令失败
2. **减少人工干预**: 自动处理临时性通信问题
3. **保持数据完整性**: 确保重要的电表数据能够及时采集
4. **提供可观测性**: 通过日志和统计了解系统通信质量

### 9. 注意事项

1. **资源管理**: 系统会自动清理超时和完成的命令，避免内存泄漏
2. **并发控制**: 同一设备的同一命令不会并发重试
3. **网络负载**: 重试机制会增加一定的网络负载，但通过合理的延迟控制影响
4. **日志量**: 重试会产生额外的日志，需要定期清理

### 10. 故障排除

如果重试机制不工作，请检查：

1. **MQTT连接状态**: 确保MQTT服务正常连接
2. **设备在线状态**: 确保目标设备在线
3. **协议配置**: 确保电表的协议配置正确
4. **网络连通性**: 检查网络连接是否稳定

---

## 总结

RTU命令重试机制已成功实现并集成到系统中，能够自动处理电表命令发送失败的情况，最多重试3次，有效提高了系统的可靠性和数据采集成功率。