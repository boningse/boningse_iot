# 电表数据解析协议配置重构

## 修改目标

确保电表数据解析只使用电表自身的协议配置，不再依赖电表的上级设备配置的协议。

## 修改内容

### 1. 修改 `electricMeterMqttService.js`

#### 1.1 `handleElectricMeterData` 方法

**修改前：**
```javascript
// 首先尝试从电表获取协议配置
if (electricMeter.protocol_config_id) {
  // 获取电表协议配置
}

// 如果电表没有协议配置，则使用设备的协议配置作为备选
if (!protocolConfig) {
  protocolConfig = device.protocol_config;
  protocolConfigSource = '设备协议配置(备选)';
  
  logger.warn(`电表缺少专用协议配置，使用设备协议配置作为备选，可能导致解析错误`);
}
```

**修改后：**
```javascript
// 只使用电表自身的协议配置
if (!electricMeter.protocol_config_id) {
  throw new Error(`电表 ${electricMeter.meter_number} 缺少协议配置，请为电表配置专用的协议配置`);
}

const protocolConfigRecord = await ProtocolConfig.findByPk(electricMeter.protocol_config_id);
if (!protocolConfigRecord) {
  throw new Error(`电表 ${electricMeter.meter_number} 的协议配置 ${electricMeter.protocol_config_id} 不存在`);
}
```

#### 1.2 `publishSingleRtuCommand` 方法中的协议配置获取

**修改前：**
```javascript
// 获取电表的协议配置
let protocolConfig = electricMeter.protocol_config;
if (!protocolConfig && device.protocol_config) {
  protocolConfig = device.protocol_config;
}
```

**修改后：**
```javascript
// 只使用电表自身的协议配置，不再使用设备协议配置作为备选
let protocolConfig = null;
if (electricMeter.protocol_config_id) {
  const protocolConfigRecord = await ProtocolConfig.findByPk(electricMeter.protocol_config_id);
  if (protocolConfigRecord) {
    protocolConfig = {
      modbus_registers: protocolConfigRecord.modbus_registers,
      data_parsing_config: protocolConfigRecord.data_parsing_config,
      modbus_config: protocolConfigRecord.modbus_config
    };
  }
}

if (!protocolConfig) {
  logger.warn(`电表 ${electricMeter.meter_number} 缺少协议配置，跳过命令记录`);
  return; // 跳过命令记录，避免使用错误的协议配置
}
```

### 2. 修改 `show_electric_meter_command.js`

**修改前：**
```javascript
// 使用设备的协议配置，而不是电表的协议配置
if (!device.protocol_config) {
  console.log('❌ 设备缺少协议配置');
  continue;
}

const command = buildModbusCommand(electricMeter, device.protocol_config);
```

**修改后：**
```javascript
// 使用电表自身的协议配置
if (!electricMeter.protocol_config_id) {
  console.log('❌ 电表缺少协议配置');
  continue;
}

const protocolConfig = await ProtocolConfig.findByPk(electricMeter.protocol_config_id);
if (!protocolConfig) {
  console.log('❌ 电表的协议配置不存在');
  continue;
}

const command = buildModbusCommand(electricMeter, protocolConfig);
```

## 修改影响

### 1. 数据解析准确性提升

- **之前**：电表可能使用设备的协议配置进行数据解析，导致协议混用问题
- **现在**：每个电表严格使用自己的协议配置，确保解析准确性

### 2. 错误处理改进

- **之前**：缺少电表协议配置时会回退到设备协议配置，可能导致静默错误
- **现在**：缺少电表协议配置时会明确抛出错误，便于问题定位

### 3. 系统架构清晰化

- **之前**：电表和设备的协议配置职责不清
- **现在**：明确电表使用自己的协议配置，设备协议配置仅用于设备级别的通信

## 验证结果

通过运行测试脚本 `test_electric_meter_protocol_usage.js`，验证结果如下：

```
=== 统计结果 ===
✅ 有电表协议配置: 4 个
❌ 缺少电表协议配置: 0 个
📱 有设备协议配置: 4 个

=== 测试数据处理逻辑 ===
测试电表: 测试电表1
✅ 数据处理逻辑测试通过（使用电表自身协议配置）

=== 建议 ===
✅ 所有电表都已配置协议，符合新的数据解析要求
```

### 验证要点

1. **协议配置完整性**：所有电表都已配置专用的协议配置
2. **数据处理逻辑**：修改后的代码能正确使用电表自身的协议配置
3. **错误处理**：缺少协议配置时能正确抛出错误

## 最佳实践建议

### 1. 电表协议配置管理

- 每个电表必须配置专用的协议配置
- 协议配置应包含完整的寄存器定义
- 定期检查协议配置的有效性

### 2. 设备协议配置用途

- 设备协议配置主要用于设备级别的MQTT通信配置
- 不应用于电表数据解析
- 可以作为DTU网关的通信协议配置

### 3. 监控和告警

- 监控电表协议配置的完整性
- 对缺少协议配置的电表进行告警
- 记录协议配置使用情况的日志

## 相关文件

- `/backend/services/electricMeterMqttService.js` - 主要的电表MQTT数据服务
- `/backend/services/electricMeterDataService.js` - 电表数据处理服务（已正确使用电表协议配置）
- `/backend/services/devicePollingService.js` - 设备轮询服务（已正确使用电表协议配置）
- `/backend/show_electric_meter_command.js` - 电表命令展示脚本
- `/backend/test_electric_meter_protocol_usage.js` - 协议配置使用测试脚本

## 总结

通过这次重构，系统现在能够：

1. **严格使用电表自身的协议配置**进行数据解析
2. **避免协议混用问题**，提高数据解析准确性
3. **提供明确的错误提示**，便于问题定位和解决
4. **保持系统架构的清晰性**，明确各组件的职责

这些修改确保了电表数据解析的准确性和系统的可维护性，符合工业物联网应用的最佳实践。