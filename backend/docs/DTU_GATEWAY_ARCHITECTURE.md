# DTU网关架构设计方案

## 概述

当前系统采用直接TCP连接方式与Modbus设备通信，但实际应用中，电表数据采集通常采用DTU（Data Terminal Unit）作为数据采集网关，架构如下：

```
电表 <--Modbus--> DTU网关 <--MQTT--> 后端系统
```

## 当前架构问题

1. **连接方式不匹配**：当前代码尝试直接TCP连接电表设备，但实际应用中DTU作为中间网关
2. **协议层次混淆**：将Modbus协议和MQTT协议混合在同一层处理
3. **设备模型不清晰**：没有区分DTU设备和电表设备的概念

## 改进方案

### 1. 设备模型重构

#### 1.1 DTU设备模型
```javascript
// DTU设备配置
{
  "device_type": "dtu_gateway",
  "connection_type": "mqtt",
  "mqtt_config": {
    "subscribe_topics": ["zhhl/{manufacturer_code}/{imei}/publish"],
    "publish_topics": ["zhhl/{manufacturer_code}/{imei}/command"],
    "heartbeat_interval": 60
  },
  "modbus_config": {
    "protocol_type": "modbus_rtu",
    "baud_rate": 9600,
    "data_bits": 8,
    "stop_bits": 1,
    "parity": "none"
  }
}
```

#### 1.2 电表设备模型
```javascript
// 电表设备配置（挂载在DTU下）
{
  "device_type": "electric_meter",
  "parent_device_id": "dtu_device_uuid",
  "modbus_address": 1,
  "meter_type": "single_phase",
  "protocol_config_id": "protocol_uuid"
}
```

### 2. 服务架构重构

#### 2.1 DTU网关服务 (DtuGatewayService)
```javascript
class DtuGatewayService {
  constructor() {
    this.mqttService = require('./mqttService');
    this.connectedDtus = new Map();
  }

  // 处理DTU上报的数据
  async handleDtuData(topic, payload) {
    const { manufacturer_code, imei } = this.parseTopicInfo(topic);
    const dtuDevice = await this.findDtuByImei(imei);
    
    if (!dtuDevice) {
      logger.warn(`未找到DTU设备: ${imei}`);
      return;
    }

    // 解析Modbus数据
    const modbusData = this.parseModbusData(payload);
    
    // 分发到对应的电表
    await this.distributeToElectricMeters(dtuDevice, modbusData);
  }

  // 向DTU发送Modbus命令
  async sendModbusCommand(dtuDevice, meterAddress, command) {
    const topic = `zhhl/${dtuDevice.manufacturer_code}/${dtuDevice.imei}/command`;
    const payload = {
      type: 'modbus_command',
      meter_address: meterAddress,
      function_code: command.function_code,
      address: command.address,
      value: command.value,
      timestamp: Date.now()
    };
    
    await this.mqttService.publish(topic, JSON.stringify(payload));
  }
}
```

#### 2.2 电表数据处理服务 (ElectricMeterDataService)
```javascript
class ElectricMeterDataService {
  // 处理从DTU转发的电表数据
  async processElectricMeterData(dtuDevice, meterAddress, modbusData) {
    const electricMeter = await this.findElectricMeterByAddress(dtuDevice.id, meterAddress);
    
    if (!electricMeter) {
      logger.warn(`未找到电表: DTU=${dtuDevice.id}, Address=${meterAddress}`);
      return;
    }

    // 根据协议配置解析数据
    const protocolConfig = electricMeter.protocol_config;
    const parsedData = await this.parseElectricMeterData(modbusData, protocolConfig);
    
    // 存储数据
    await this.storeElectricMeterData(electricMeter, parsedData);
    
    // 实时推送
    await this.broadcastElectricMeterData(electricMeter, parsedData);
  }
}
```

### 3. MQTT主题设计

#### 3.1 数据上报主题
```
// DTU上报电表数据
zhhl/{manufacturer_code}/{dtu_imei}/publish

// 消息格式
{
  "type": "modbus_data",
  "timestamp": 1642752000000,
  "data": [
    {
      "meter_address": 1,
      "function_code": 3,
      "start_address": 0,
      "registers": [100, 200, 300]
    }
  ]
}
```

#### 3.2 命令下发主题
```
// 向DTU发送Modbus命令
zhhl/{manufacturer_code}/{dtu_imei}/command

// 消息格式
{
  "type": "modbus_command",
  "command_id": "cmd_uuid",
  "meter_address": 1,
  "function_code": 6,
  "address": 100,
  "value": 500,
  "timestamp": 1642752000000
}
```

### 4. 数据库表结构调整

#### 4.1 设备表增加字段
```sql
ALTER TABLE devices ADD COLUMN device_category VARCHAR(20) DEFAULT 'standalone';
-- 值: 'standalone', 'gateway', 'sub_device'

ALTER TABLE devices ADD COLUMN parent_device_id UUID REFERENCES devices(id);
-- 子设备指向父设备（DTU）

ALTER TABLE devices ADD COLUMN connection_config JSONB;
-- 存储连接配置（MQTT、Modbus等）
```

#### 4.2 电表表增加DTU关联
```sql
ALTER TABLE electric_meters ADD COLUMN dtu_device_id UUID REFERENCES devices(id);
-- 电表关联到DTU设备
```

### 5. 实施步骤

#### 阶段1：基础架构调整
1. 修改设备模型，增加设备分类和层级关系
2. 创建DTU网关服务基础框架
3. 调整MQTT服务，支持DTU数据处理

#### 阶段2：数据流重构
1. 实现DTU数据解析和分发逻辑
2. 修改电表数据处理流程
3. 实现Modbus命令通过DTU下发

#### 阶段3：兼容性处理
1. 保持现有API接口不变
2. 添加DTU管理相关API
3. 实现数据迁移脚本

### 6. 配置示例

#### 6.1 DTU设备配置
```json
{
  "name": "测试DTU",
  "device_id": "DTU001",
  "imei": "865661074511729",
  "manufacturer_code": "BNDBA",
  "device_category": "gateway",
  "connection_config": {
    "type": "mqtt",
    "mqtt": {
      "subscribe_topics": ["zhhl/BNDBA/865661074511729/publish"],
      "publish_topics": ["zhhl/BNDBA/865661074511729/command"]
    },
    "modbus": {
      "protocol": "rtu",
      "baud_rate": 9600,
      "data_bits": 8,
      "stop_bits": 1,
      "parity": "none"
    }
  }
}
```

#### 6.2 电表设备配置
```json
{
  "name": "1号电表",
  "device_category": "sub_device",
  "parent_device_id": "dtu_uuid",
  "meter_address": 1,
  "protocol_config_id": "modbus_protocol_uuid"
}
```

## 总结

通过这种架构调整，系统将能够：

1. **正确处理DTU网关模式**：DTU作为MQTT客户端连接后端，电表通过Modbus连接DTU
2. **清晰的设备层级**：区分网关设备和子设备，建立正确的层级关系
3. **灵活的协议支持**：MQTT用于DTU通信，Modbus用于电表通信
4. **统一的数据处理**：通过DTU网关服务统一处理所有电表数据
5. **向后兼容**：保持现有API接口，平滑迁移现有系统

这种设计更符合实际的工业物联网应用场景，提供了更好的可扩展性和维护性。