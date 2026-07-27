# Modbus RTU 字节流格式支持

本文档描述了系统中新增的 Modbus RTU 字节流格式支持功能，包括实现原理、使用方法和示例。

## 概述

系统原本只支持 Modbus TCP 和 JSON 格式的高层协议通信。为了支持更多类型的电表设备，特别是需要 RTU 字节流格式的设备，我们新增了完整的 Modbus RTU 支持，包括：

- ✅ RTU 字节级指令构造
- ✅ CRC16 校验码计算和验证
- ✅ 十六进制格式转换
- ✅ 多种功能码支持（读取保持寄存器、输入寄存器等）
- ✅ 与现有 MQTT 服务的无缝集成

## 核心文件

### 1. `utils/modbusRtuUtils.js`
Modbus RTU 工具类，提供底层的字节流操作功能：

```javascript
const ModbusRtuUtils = require('./utils/modbusRtuUtils');

// 构造读取保持寄存器的RTU指令
const rtuBuffer = ModbusRtuUtils.buildReadHoldingRegistersRTU(1, 31, 2);
const hexString = ModbusRtuUtils.bufferToHexString(rtuBuffer);
console.log(hexString); // 输出: "01 03 00 1F 00 02 F5 CD"
```

**主要方法：**
- `calculateCRC16(buffer)` - 计算CRC16校验码
- `buildReadHoldingRegistersRTU(slaveAddr, startAddr, count)` - 构造读取保持寄存器指令
- `buildReadInputRegistersRTU(slaveAddr, startAddr, count)` - 构造读取输入寄存器指令
- `buildWriteSingleRegisterRTU(slaveAddr, regAddr, value)` - 构造写入单个寄存器指令
- `parseRTUResponse(buffer)` - 解析RTU响应数据
- `bufferToHexString(buffer)` - Buffer转十六进制字符串
- `hexStringToBuffer(hexString)` - 十六进制字符串转Buffer

### 2. `services/electricMeterMqttService.js`
电表MQTT服务，已扩展支持RTU格式：

```javascript
const service = new ElectricMeterMqttService();

// 启动RTU格式轮询
service.startPolling(30000, { useRtuFormat: true });

// 构造RTU格式命令
const command = service.buildModbusCommand(electricMeter, modbusConfig, { useRtuFormat: true });
```

## 使用方法

### 1. 协议配置

在设备的协议配置中，设置通信格式为RTU：

```json
{
  "communication_config": {
    "format": "rtu",
    "baud_rate": 9600,
    "data_bits": 8,
    "stop_bits": 1,
    "parity": "none"
  },
  "readConfig": [
    {
      "name": "voltage_a",
      "description": "A相电压",
      "address": 31,
      "quantity": 2,
      "functionCode": 3,
      "dataType": "float32_be",
      "unit": "V",
      "scale": 1
    }
  ]
}
```

### 2. 启动RTU轮询

**重要提示：** 轮询间隔现在必须在设备的Modbus协议配置中设置，不再支持全局轮询方法。

```javascript
// 正确的方式：使用设备级别的轮询
const electricMeterService = new ElectricMeterMqttService();

// 为特定设备启动轮询（轮询间隔从设备的protocol_config.polling_interval读取）
electricMeterService.startDevicePolling('DEVICE_IMEI_HERE');

// 设备的协议配置示例：
// {
//   "protocol_config": {
//     "modbus_registers": [...],
//     "polling_interval": 30000,  // 必须在这里设置轮询间隔
//     "communication_config": {
//       "format": "rtu"  // RTU格式标识
//     }
//   }
// }
```

### 3. 手动构造RTU指令

```javascript
const ModbusRtuUtils = require('./utils/modbusRtuUtils');

// 读取从站地址1的保持寄存器31-32
const command1 = ModbusRtuUtils.buildReadHoldingRegistersRTU(1, 31, 2);
console.log(ModbusRtuUtils.bufferToHexString(command1)); // "01 03 00 1F 00 02 F5 CD"

// 读取从站地址2的输入寄存器100-103
const command2 = ModbusRtuUtils.buildReadInputRegistersRTU(2, 100, 4);
console.log(ModbusRtuUtils.bufferToHexString(command2)); // "02 04 00 64 00 04 30 2E"

// 写入从站地址1的寄存器100，值为1000
const command3 = ModbusRtuUtils.buildWriteSingleRegisterRTU(1, 100, 1000);
console.log(ModbusRtuUtils.bufferToHexString(command3)); // "01 06 00 64 03 E8 C9 8A"
```

## RTU指令格式

标准的Modbus RTU指令格式：

```
[从站地址] [功能码] [数据] [CRC低字节] [CRC高字节]
```

### 示例分析：`01 03 00 1F 00 02 F5 CD`

- `01` - 从站地址 (1)
- `03` - 功能码 (读取保持寄存器)
- `00 1F` - 起始地址 (31)
- `00 02` - 寄存器数量 (2)
- `F5 CD` - CRC16校验码

## 支持的功能码

| 功能码 | 描述 | 方法 |
|--------|------|------|
| 01 | 读取线圈 | `buildReadCoilsRTU` |
| 02 | 读取离散输入 | `buildReadDiscreteInputsRTU` |
| 03 | 读取保持寄存器 | `buildReadHoldingRegistersRTU` |
| 04 | 读取输入寄存器 | `buildReadInputRegistersRTU` |
| 05 | 写入单个线圈 | `buildWriteSingleCoilRTU` |
| 06 | 写入单个寄存器 | `buildWriteSingleRegisterRTU` |
| 15 | 写入多个线圈 | `buildWriteMultipleCoilsRTU` |
| 16 | 写入多个寄存器 | `buildWriteMultipleRegistersRTU` |

## 数据类型支持

系统支持多种数据类型的自动转换：

- `uint16` - 16位无符号整数
- `int16` - 16位有符号整数
- `uint32_be/le` - 32位无符号整数（大端/小端）
- `int32_be/le` - 32位有符号整数（大端/小端）
- `float32_be/le` - 32位浮点数（大端/小端）
- `float64_be` - 64位浮点数（大端）
- `string` - 字符串
- `boolean` - 布尔值

## 测试和验证

### 运行测试脚本

```bash
# 基础RTU功能测试
node test_modbus_rtu.js

# RTU集成测试
node test_rtu_integration.js

# RTU使用示例
node example_rtu_usage.js
```

### 测试结果示例

```
=== RTU格式集成测试 ===

✓ RTU指令构造功能正常
✓ CRC校验计算正确
✓ 十六进制格式转换正常
✓ 电表MQTT服务RTU支持已集成

生成的RTU指令:
1. voltage_a (A相电压)
   RTU指令: 01 03 00 1F 00 02 F5 CD
   功能码: 3, 地址: 31, 数量: 2
```

## MQTT消息格式

### RTU格式的命令消息

```json
{
  "type": "modbus_query",
  "meter_address": 1,
  "meter_id": 1,
  "meter_number": "EM001",
  "timestamp": "2025-01-17T11:42:26.979Z",
  "format": "rtu",
  "queries": [
    {
      "function_code": 3,
      "start_address": 31,
      "quantity": 2,
      "data_type": "float32_be"
    }
  ],
  "rtu_commands": [
    {
      "register_name": "voltage_a",
      "description": "A相电压",
      "function_code": 3,
      "start_address": 31,
      "count": 2,
      "quantity": 2,
      "hex_command": "01 03 00 1F 00 02 F5 CD",
      "raw_bytes": [1, 3, 0, 31, 0, 2, 245, 205]
    }
  ]
}
```

## 错误处理

系统包含完善的错误处理机制：

- **CRC校验失败** - 自动重试或记录错误
- **不支持的功能码** - 跳过并记录警告
- **地址超出范围** - 参数验证和错误提示
- **通信超时** - 超时重试机制

## 性能优化

- **批量指令** - 支持一次发送多个RTU指令
- **指令缓存** - 缓存常用的RTU指令避免重复构造
- **并发控制** - 控制同时发送的指令数量
- **轮询间隔** - 可配置的设备间轮询间隔

## 兼容性

- ✅ 向后兼容现有的JSON格式
- ✅ 支持TCP和RTU格式混合使用
- ✅ 自动格式检测和切换
- ✅ 现有设备配置无需修改

## 常见问题

### Q: 如何判断设备是否支持RTU格式？
A: 在设备协议配置中设置 `communication_config.format = "rtu"`，系统会自动使用RTU格式。

### Q: RTU指令的CRC校验码是如何计算的？
A: 使用标准的CRC16-ANSI算法，多项式为0xA001，初始值为0xFFFF。

### Q: 可以同时使用TCP和RTU格式吗？
A: 可以，系统支持不同设备使用不同的通信格式。

### Q: 如何调试RTU指令？
A: 可以使用 `bufferToHexString()` 方法查看生成的十六进制指令，并与设备文档对比。

## 更新日志

- **v1.0.0** (2025-01-17)
  - 新增 ModbusRtuUtils 工具类
  - 集成 RTU 格式到 ElectricMeterMqttService
  - 支持多种功能码和数据类型
  - 完整的测试套件和使用示例

---

通过以上实现，系统现在完全支持 Modbus RTU 字节流格式，可以与各种需要 RTU 通信的电表设备进行通信。