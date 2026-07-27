# Modbus 协议集成指南

本文档介绍如何在 IoT 平台中使用 Modbus 协议进行设备通信和数据采集。

## 目录

1. [概述](#概述)
2. [安装和配置](#安装和配置)
3. [协议配置](#协议配置)
4. [设备管理](#设备管理)
5. [API 使用](#api-使用)
6. [数据解析](#数据解析)
7. [故障排除](#故障排除)
8. [示例](#示例)

## 概述

### 支持的 Modbus 功能

- **Modbus TCP**: 基于以太网的 Modbus 通信
- **功能码支持**:
  - 01: 读取线圈状态
  - 02: 读取离散输入
  - 03: 读取保持寄存器
  - 04: 读取输入寄存器
  - 05: 写入单个线圈
  - 06: 写入单个寄存器
  - 16: 写入多个寄存器

### 支持的数据类型

- **整数**: uint16, int16, uint32, int32
- **浮点数**: float32, float64
- **字符串**: ASCII 字符串
- **位字段**: 单个位或位组合
- **字节序**: 大端序 (BE) 和小端序 (LE)

## 安装和配置

### 1. 安装依赖

```bash
cd /home/ls/iot/backend
npm install jsmodbus
```

### 2. 数据库初始化

执行 SQL 脚本创建协议配置：

```bash
psql -U your_username -d your_database -f database/sql/23_insert_modbus_protocol_configs.sql
```

### 3. 创建示例设备

```bash
node scripts/createModbusDeviceExample.js create
```

## 协议配置

### 配置结构

协议配置存储在 `protocol_configs` 表中，包含以下主要部分：

```json
{
  "data_parsing_config": {
    "read_configs": [
      {
        "function_code": 3,
        "address": 0,
        "quantity": 10,
        "register_mappings": [
          {
            "name": "voltage_a",
            "address": 0,
            "data_type": "uint16",
            "scale": 0.1,
            "offset": 0,
            "unit": "V",
            "byte_order": "BE"
          }
        ]
      }
    ]
  },
  "command_config": {
    "commands": [
      {
        "name": "reset_energy",
        "function_code": 6,
        "address": 100,
        "data_type": "uint16",
        "value": 1
      }
    ]
  }
}
```

### 数据解析配置说明

#### read_configs

- `function_code`: Modbus 功能码 (1, 2, 3, 4)
- `address`: 起始地址
- `quantity`: 读取数量
- `register_mappings`: 寄存器映射配置

#### register_mappings

- `name`: 数据点名称
- `address`: 寄存器地址
- `data_type`: 数据类型 (uint16, int16, uint32, int32, float32, float64, string, bit)
- `scale`: 缩放因子
- `offset`: 偏移量
- `unit`: 单位
- `byte_order`: 字节序 (BE/LE)
- `bit_index`: 位索引 (仅用于 bit 类型)
- `string_length`: 字符串长度 (仅用于 string 类型)

### 命令配置说明

#### commands

- `name`: 命令名称
- `function_code`: Modbus 功能码 (5, 6, 16)
- `address`: 目标地址
- `data_type`: 数据类型
- `value`: 默认值
- `min_value`: 最小值
- `max_value`: 最大值
- `description`: 命令描述

## 设备管理

### 设备连接配置

设备的 `connection_config` 字段包含 Modbus 连接参数：

```json
{
  "host": "192.168.1.100",
  "port": 502,
  "unitId": 1,
  "timeout": 5000,
  "reconnectInterval": 10000
}
```

### 自动连接

设置 `auto_connect: true` 的设备会在服务器启动时自动连接。

### 数据轮询

- `polling_interval`: 数据轮询间隔 (毫秒)
- 设置为 0 禁用自动轮询

## API 使用

### 认证

所有 API 请求需要在 Header 中包含认证令牌：

```
Authorization: Bearer YOUR_TOKEN
```

### 设备管理 API

#### 获取设备列表

```http
GET /api/modbus/devices
```

#### 连接设备

```http
POST /api/modbus/devices/{deviceId}/connect
```

#### 断开设备

```http
POST /api/modbus/devices/{deviceId}/disconnect
```

#### 获取设备状态

```http
GET /api/modbus/devices/{deviceId}/status
```

### 数据操作 API

#### 手动读取数据

```http
POST /api/modbus/devices/{deviceId}/read
```

#### 执行命令

```http
POST /api/modbus/devices/{deviceId}/command
Content-Type: application/json

{
  "command_name": "reset_energy",
  "value": 1
}
```

#### 获取历史数据

```http
GET /api/modbus/devices/{deviceId}/history?start_time=2024-01-01&end_time=2024-01-02
```

#### 获取命令历史

```http
GET /api/modbus/devices/{deviceId}/command-history?limit=50
```

### 测试 API

#### 测试连接

```http
POST /api/modbus/test-connection
Content-Type: application/json

{
  "host": "192.168.1.100",
  "port": 502,
  "unitId": 1
}
```

## 数据解析

### 数据类型转换

#### 整数类型

- `uint16`: 无符号 16 位整数 (0-65535)
- `int16`: 有符号 16 位整数 (-32768 到 32767)
- `uint32`: 无符号 32 位整数 (占用 2 个寄存器)
- `int32`: 有符号 32 位整数 (占用 2 个寄存器)

#### 浮点类型

- `float32`: 32 位浮点数 (占用 2 个寄存器)
- `float64`: 64 位浮点数 (占用 4 个寄存器)

#### 字符串类型

- `string`: ASCII 字符串，每个寄存器包含 2 个字符

#### 位字段类型

- `bit`: 单个位，需要指定 `bit_index` (0-15)

### 缩放和偏移

最终值计算公式：
```
最终值 = (原始值 * scale) + offset
```

示例：
- 原始值: 1234
- scale: 0.1
- offset: -10
- 最终值: (1234 * 0.1) + (-10) = 113.4

### 字节序

- `BE` (Big Endian): 大端序，高字节在前
- `LE` (Little Endian): 小端序，低字节在前

## 故障排除

### 常见问题

#### 1. 连接超时

**问题**: 设备连接超时

**解决方案**:
- 检查网络连接
- 验证 IP 地址和端口
- 增加超时时间
- 检查防火墙设置

#### 2. 数据解析错误

**问题**: 读取的数据不正确

**解决方案**:
- 检查寄存器地址
- 验证数据类型
- 确认字节序设置
- 检查缩放和偏移参数

#### 3. 命令执行失败

**问题**: 写入命令失败

**解决方案**:
- 验证设备支持的功能码
- 检查地址范围
- 确认数据类型和值范围
- 检查设备权限设置

### 调试方法

#### 1. 启用详细日志

在环境变量中设置：
```bash
LOG_LEVEL=debug
```

#### 2. 使用测试连接 API

```bash
curl -X POST http://localhost:3003/api/modbus/test-connection \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"host": "192.168.1.100", "port": 502, "unitId": 1}'
```

#### 3. 检查设备状态

```bash
curl -X GET http://localhost:3003/api/modbus/devices/{deviceId}/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 示例

### 智能电表配置示例

```json
{
  "name": "智能电表 Modbus 协议",
  "version": "1.0",
  "manufacturer_code": "METER_001",
  "device_type": "smart_meter",
  "data_parsing_config": {
    "read_configs": [
      {
        "function_code": 3,
        "address": 0,
        "quantity": 20,
        "register_mappings": [
          {
            "name": "voltage_a",
            "address": 0,
            "data_type": "uint16",
            "scale": 0.1,
            "offset": 0,
            "unit": "V",
            "byte_order": "BE"
          },
          {
            "name": "current_a",
            "address": 1,
            "data_type": "uint16",
            "scale": 0.01,
            "offset": 0,
            "unit": "A",
            "byte_order": "BE"
          },
          {
            "name": "power_total",
            "address": 10,
            "data_type": "uint32",
            "scale": 0.001,
            "offset": 0,
            "unit": "kW",
            "byte_order": "BE"
          }
        ]
      }
    ]
  },
  "command_config": {
    "commands": [
      {
        "name": "reset_energy",
        "function_code": 6,
        "address": 100,
        "data_type": "uint16",
        "value": 1,
        "description": "重置电能计量"
      }
    ]
  }
}
```

### 环境监测设备配置示例

```json
{
  "name": "环境监测设备 Modbus 协议",
  "version": "1.0",
  "manufacturer_code": "ENV_001",
  "device_type": "environment_sensor",
  "data_parsing_config": {
    "read_configs": [
      {
        "function_code": 4,
        "address": 0,
        "quantity": 10,
        "register_mappings": [
          {
            "name": "temperature",
            "address": 0,
            "data_type": "int16",
            "scale": 0.1,
            "offset": 0,
            "unit": "°C",
            "byte_order": "BE"
          },
          {
            "name": "humidity",
            "address": 1,
            "data_type": "uint16",
            "scale": 0.1,
            "offset": 0,
            "unit": "%RH",
            "byte_order": "BE"
          },
          {
            "name": "pm25",
            "address": 4,
            "data_type": "uint16",
            "scale": 1,
            "offset": 0,
            "unit": "μg/m³",
            "byte_order": "BE"
          }
        ]
      }
    ]
  },
  "command_config": {
    "commands": [
      {
        "name": "calibrate_sensor",
        "function_code": 6,
        "address": 200,
        "data_type": "uint16",
        "value": 1,
        "description": "传感器校准"
      }
    ]
  }
}
```

### 完整的设备创建和使用流程

```bash
# 1. 创建示例设备
node scripts/createModbusDeviceExample.js create

# 2. 启动服务器
npm start

# 3. 获取设备列表
curl -X GET http://localhost:3003/api/modbus/devices \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. 连接设备
curl -X POST http://localhost:3003/api/modbus/devices/1/connect \
  -H "Authorization: Bearer YOUR_TOKEN"

# 5. 读取数据
curl -X POST http://localhost:3003/api/modbus/devices/1/read \
  -H "Authorization: Bearer YOUR_TOKEN"

# 6. 执行命令
curl -X POST http://localhost:3003/api/modbus/devices/1/command \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"command_name": "reset_energy", "value": 1}'

# 7. 查看历史数据
curl -X GET "http://localhost:3003/api/modbus/devices/1/history?start_time=2024-01-01&end_time=2024-01-02" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 扩展开发

### 添加新的数据类型

在 `utils/modbusParser.js` 中添加新的解析方法：

```javascript
parseCustomType(buffer, offset, config) {
  // 自定义数据类型解析逻辑
  return parsedValue;
}
```

### 添加新的功能码支持

在 `services/modbusService.js` 中添加新的读写方法：

```javascript
async readCustomFunction(address, quantity) {
  // 自定义功能码实现
}
```

### 自定义协议配置

创建新的协议配置模板并插入到 `protocol_configs` 表中。

---

## 技术支持

如有问题，请查看日志文件或联系技术支持团队。

- 日志位置: `logs/` 目录
- 配置文件: `config/` 目录
- 示例脚本: `scripts/` 目录