# 设备数据解析功能指南

## 概述

本系统现在支持根据设备类型的数据格式定义自动解析和存储设备数据。这个功能允许系统根据不同设备类型的 `data_format` 配置，智能地解析接收到的MQTT消息，并将结构化数据存储到数据库中。

## 功能特性

### 1. 自动数据解析
- 根据设备类型的 `data_format` 定义自动解析设备数据
- 支持多种数据类型：`number`、`string`、`boolean`
- 自动类型转换和验证
- 忽略未定义的字段，只处理配置中指定的字段

### 2. 灵活的数据格式支持
- 支持JSON对象和JSON字符串格式的输入数据
- 自动处理数据类型转换（如字符串转数字）
- 处理无效数据值（如无效数字转换为null）

### 3. 多设备类型支持
- 为不同设备类型提供专门的存储策略
- BNDK传感器数据存储到专门的传感器数据表
- 其他设备类型使用通用存储方式
- 保持向后兼容性（照明设备的特殊处理仍然有效）

## 数据格式配置

### 设备类型数据格式定义

在 `device_types` 表中，每个设备类型都可以定义 `data_format` 字段（JSONB类型），用于描述该设备类型的数据结构：

```json
{
  "fields": [
    {
      "name": "temperature",
      "type": "number",
      "unit": "°C",
      "range": "-40~85"
    },
    {
      "name": "humidity",
      "type": "number",
      "unit": "%RH",
      "range": "0~100"
    },
    {
      "name": "status",
      "type": "boolean"
    },
    {
      "name": "device_name",
      "type": "string"
    }
  ]
}
```

### 支持的字段类型

| 类型 | 描述 | 转换规则 |
|------|------|----------|
| `number` | 数值类型 | 字符串自动转换为数字，无效值转为null |
| `string` | 字符串类型 | 任何值转换为字符串 |
| `boolean` | 布尔类型 | 支持多种格式：true/false、1/0、on/off |

## 使用示例

### 1. BNDK传感器数据解析

**设备类型配置：**
```sql
INSERT INTO device_types (name, data_format) VALUES (
  'BNDK传感器',
  '{
    "fields": [
      {"name": "temperature", "type": "number", "unit": "°C"},
      {"name": "humidity", "type": "number", "unit": "%RH"},
      {"name": "pressure", "type": "number", "unit": "hPa"},
      {"name": "co2", "type": "number", "unit": "ppm"}
    ]
  }'
);
```

**输入数据：**
```json
{
  "temperature": 25.5,
  "humidity": 60.2,
  "pressure": 1013.25,
  "co2": 400,
  "extra_field": "ignored"
}
```

**解析结果：**
```json
{
  "temperature": 25.5,
  "humidity": 60.2,
  "pressure": 1013.25,
  "co2": 400
}
```

### 2. 智能开关数据解析

**设备类型配置：**
```sql
INSERT INTO device_types (name, data_format) VALUES (
  '智能开关',
  '{
    "fields": [
      {"name": "switch1", "type": "boolean"},
      {"name": "switch2", "type": "boolean"},
      {"name": "power", "type": "number", "unit": "W"},
      {"name": "voltage", "type": "number", "unit": "V"}
    ]
  }'
);
```

**输入数据：**
```json
{
  "switch1": "on",
  "switch2": false,
  "power": "150.5",
  "voltage": 220
}
```

**解析结果：**
```json
{
  "switch1": true,
  "switch2": false,
  "power": 150.5,
  "voltage": 220
}
```

## 数据存储策略

### 1. BNDK传感器数据
- 存储到 `device_data` 表，`data_type` 为 `'sensor_data'`
- payload 包含解析后的传感器数据和设备类型信息

### 2. 其他设备类型
- 存储到 `device_data` 表，`data_type` 为 `'parsed_data'`
- payload 包含解析后的数据、设备类型和解析时间戳

### 3. 原始数据保留
- 所有原始MQTT消息仍然保存到 `device_data` 表，`data_type` 为 `'sensor'`
- 确保数据的完整性和可追溯性

## 实现细节

### 核心方法

1. **`parseAndStoreDeviceData(device, data, topic)`**
   - 主要的数据解析和存储方法
   - 根据设备类型的 `data_format` 解析数据
   - 调用相应的存储策略

2. **`convertFieldValue(value, type)`**
   - 字段值类型转换
   - 支持 number、string、boolean 类型转换

3. **`saveTypedDeviceData(device, extractedData, dataFormat)`**
   - 根据设备类型选择存储策略
   - 支持扩展新的设备类型存储逻辑

### 缓存优化

- 设备信息包含设备类型数据，减少数据库查询
- 设备缓存包含 `data_format` 和 `command_format` 信息
- 5分钟缓存过期时间，平衡性能和数据一致性

## 扩展指南

### 添加新的设备类型

1. **定义数据格式**
   ```sql
   INSERT INTO device_types (name, data_format) VALUES (
     '新设备类型',
     '{
       "fields": [
         {"name": "field1", "type": "number"},
         {"name": "field2", "type": "string"}
       ]
     }'
   );
   ```

2. **添加专门的存储逻辑（可选）**
   在 `saveTypedDeviceData` 方法中添加新的设备类型处理：
   ```javascript
   if (deviceTypeName === '新设备类型') {
     await this.saveNewDeviceTypeData(device, extractedData);
   }
   ```

### 添加新的字段类型

在 `convertFieldValue` 方法中添加新的类型处理：
```javascript
case 'datetime':
  return this.extractDateTimeValue(value);
case 'array':
  return this.extractArrayValue(value);
```

## 测试

运行测试脚本验证数据解析功能：
```bash
node test_device_data_parsing.js
```

测试覆盖：
- 完整数据解析
- 部分数据和类型转换
- JSON字符串解析
- 无设备类型定义的处理
- 无效数据值的处理

## 注意事项

1. **向后兼容性**
   - 照明设备的特殊处理逻辑仍然保留
   - 原有的数据存储方式不受影响

2. **性能考虑**
   - 设备缓存包含设备类型信息，减少数据库查询
   - 只解析配置中定义的字段，忽略其他字段

3. **错误处理**
   - JSON解析错误不会影响系统运行
   - 类型转换失败时使用null值
   - 详细的错误日志记录

4. **数据一致性**
   - 原始数据和解析数据都会保存
   - 解析失败不影响原始数据存储

## 监控和调试

### 日志信息

- 成功解析：`设备数据已根据类型定义解析和存储`
- 无数据格式：`设备类型未定义数据格式`
- 解析失败：`解析和存储设备数据失败`
- JSON解析错误：`无法解析设备数据JSON`

### WebSocket推送

解析后的数据会通过WebSocket推送到前端：
- `device_data` 事件：包含解析后的设备数据
- `communication_log` 事件：包含通信日志信息

这个功能为IoT系统提供了强大的数据处理能力，支持多种设备类型的自动化数据解析和存储，同时保持了系统的灵活性和可扩展性。