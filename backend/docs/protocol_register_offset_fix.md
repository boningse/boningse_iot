# 协议寄存器偏移量修复文档

## 问题描述

用户指出了一个重要问题：不同协议的寄存器占用空间不同（有的是1个寄存器，有的是2个寄存器），在解析批量查询响应时，需要根据协议配置参数进行动态调整，不能采用统一的处理方式。

### 具体问题

1. **数据类型差异**：
   - `uint16` 类型占用 1 个寄存器（16位）
   - `uint32`、`int32`、`float32` 类型占用 2 个寄存器（32位）

2. **原有问题**：
   - `mqttService.js` 中使用固定的 `registerSize = 1` 假设
   - `electricMeterMqttService.js` 中缺少对 `int32` 数据类型的处理
   - 偏移量计算没有考虑不同数据类型的寄存器占用差异

## 根本原因分析

在Modbus批量查询中，不同数据类型占用的寄存器数量不同：

- **16位数据类型**（`uint16`、`int16`）：占用 1 个寄存器
- **32位数据类型**（`uint32`、`int32`、`float32`）：占用 2 个寄存器

当计算批量查询中每个寄存器的偏移量时，必须累加前面所有寄存器实际占用的空间，而不是简单地按地址差计算。

## 解决方案

### 1. 修复 mqttService.js 中的批量查询响应解析

**修改前**：
```javascript
const registerSize = 1; // 假设每个寄存器占用1个16位字

if (offset < registers.length) {
  // ...
  const actualAddress = startAddress + offset;
  electricMeterData.register_data[actualAddress] = value;
}
```

**修改后**：
```javascript
// 根据数据类型确定寄存器占用的字数
const registerWords = (mapping.data_type === 'uint32' || mapping.data_type === 'int32' || mapping.data_type === 'float32') ? 2 : 1;

if (offset + registerWords - 1 < registers.length) {
  // ...
  // 使用配置的寄存器地址作为实际地址
  const actualAddress = mapping.address;
  electricMeterData.register_data[actualAddress] = value;
}
```

### 2. 修复 electricMeterMqttService.js 中的偏移量计算

**修改前**：
```javascript
const registerWords = (existingMapping.data_type === 'uint32' || existingMapping.data_type === 'float32') ? 2 : 1;
```

**修改后**：
```javascript
const registerWords = (existingMapping.data_type === 'uint32' || existingMapping.data_type === 'int32' || existingMapping.data_type === 'float32') ? 2 : 1;
```

## 核心原理

### 偏移量计算原理

在批量查询中，每个寄存器的偏移量应该是前面所有寄存器占用空间的累加：

```
offset = Σ(前面所有寄存器的registerWords)
```

例如，对于以下寄存器配置：
- 寄存器100：`uint16`（占用1个字）→ offset = 0
- 寄存器101：`uint16`（占用1个字）→ offset = 1
- 寄存器102：`uint32`（占用2个字）→ offset = 2
- 寄存器104：`float32`（占用2个字）→ offset = 4
- 寄存器106：`uint16`（占用1个字）→ offset = 6

### 地址映射原理

在批量查询响应解析中：
- **不应该**使用 `startAddress + offset`
- **应该**使用 `mapping.address`（协议配置中的实际寄存器地址）

因为 `offset` 是在响应数据数组中的位置，而 `mapping.address` 是寄存器的真实Modbus地址。

## 验证测试

创建了综合测试用例验证修复效果：

### 测试用例1：混合数据类型
```javascript
const protocolRegisters = [
  { name: 'voltage_A', address: 100, data_type: 'uint16' },    // offset: 0
  { name: 'current_A', address: 101, data_type: 'uint16' },    // offset: 1
  { name: 'power_total', address: 102, data_type: 'uint32' },  // offset: 2
  { name: 'energy_total', address: 104, data_type: 'float32' }, // offset: 4
  { name: 'frequency', address: 106, data_type: 'uint16' }     // offset: 6
];
```

### 测试用例2：全32位数据类型
```javascript
const protocolRegisters = [
  { name: 'uint32_val', address: 300, data_type: 'uint32' },   // offset: 0
  { name: 'int32_val', address: 302, data_type: 'int32' },     // offset: 2
  { name: 'float32_val', address: 304, data_type: 'float32' }  // offset: 4
];
```

所有测试用例均通过验证，确认修复正确。

## 影响范围

### 修改的文件
1. **mqttService.js**：批量查询响应解析逻辑
2. **electricMeterMqttService.js**：偏移量计算逻辑

### 不受影响的文件
- 单个寄存器查询的解析逻辑保持不变
- 协议配置文件无需修改
- 现有的寄存器映射配置兼容

## 关键改进

1. **动态寄存器占用计算**：根据数据类型动态确定寄存器占用空间
2. **正确的偏移量累加**：考虑前面所有寄存器的实际占用空间
3. **准确的地址映射**：使用协议配置中的寄存器地址而不是计算地址
4. **完整的数据类型支持**：支持 `uint16`、`uint32`、`int32`、`float32` 所有常用类型

## 预防措施

1. **代码审查**：在批量查询相关代码中，确保考虑不同数据类型的寄存器占用差异
2. **测试覆盖**：为新的批量查询功能添加混合数据类型的测试用例
3. **文档说明**：在相关函数中添加数据类型和偏移量计算的注释说明
4. **协议配置验证**：在协议配置解析时验证数据类型的正确性

## 总结

这次修复解决了Modbus批量查询中不同协议寄存器占用空间差异的问题。通过动态计算寄存器占用空间和正确的偏移量累加，确保了批量查询响应能够正确解析到对应的寄存器地址，支持了混合数据类型的协议配置。

修复的核心思想是：**根据协议配置参数动态调整处理方式，而不是采用统一的固定处理方式**。这样既保证了解析的准确性，又提供了对不同协议的良好兼容性。