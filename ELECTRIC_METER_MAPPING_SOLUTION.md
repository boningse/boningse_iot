# 电表数据映射问题解决方案

## 问题描述

电表数据解析后，没有按照协议配置中的寄存器数据名称来写进电表数据库相应的列中，而是都写在第一个数据中了。

## 根本原因分析

1. **协议配置格式不一致**：协议配置中使用中文寄存器名称（如"A相电流"、"有功功率"），而数据库列使用英文名称（如`phase_a_current`、`active_power`）

2. **映射逻辑缺失**：`extractElectricParameters`方法使用硬编码的英文参数映射，没有根据协议配置中的中文寄存器名称进行动态映射

3. **数据解析不完整**：`parseElectricMeterData`方法没有正确处理新的协议配置格式

## 解决方案

### 1. 改进数据解析方法

修改了`parseElectricMeterData`方法，支持两种协议配置格式：

#### 新格式（推荐）
```javascript
{
  data_parsing_config: {
    modbus: {
      registers: [
        { name: 'A相电流', address: 0, scale: 0.01, offset: 0 },
        { name: 'B相电流', address: 1, scale: 0.01, offset: 0 }
      ]
    }
  }
}
```

#### 旧格式（兼容）
```javascript
{
  modbus_config: {
    registers: {
      'A相电流': { address: 0, scale: 0.01 },
      'B相电流': { address: 1, scale: 0.01 }
    }
  }
}
```

### 2. 建立完整的参数映射

重构了`extractElectricParameters`方法，建立了中文寄存器名称到英文数据库列名的完整映射：

#### 中文寄存器名称映射
```javascript
const registerToColumnMapping = {
  // 电量参数
  '总电量': 'energy',
  '有功电量': 'active_energy',
  '无功电量': 'reactive_energy',
  
  // 电流参数
  'A相电流': 'phase_a_current',
  'B相电流': 'phase_b_current',
  'C相电流': 'phase_c_current',
  
  // 电压参数
  'A相电压': 'phase_a_voltage',
  'B相电压': 'phase_b_voltage',
  'C相电压': 'phase_c_voltage',
  
  // 功率参数
  '有功功率': 'active_power',
  '无功功率': 'reactive_power',
  '视在功率': 'apparent_power',
  
  // 其他参数
  '功率因数': 'power_factor',
  '温度': 'temperature',
  '频率': 'frequency'
};
```

#### 英文参数名兼容映射
```javascript
const englishMapping = {
  'current_a': 'phase_a_current',
  'voltage_a': 'phase_a_voltage',
  'active_power': 'active_power',
  'power_factor': 'power_factor',
  // ... 更多映射
};
```

### 3. 增强的数据库列验证

添加了`isValidDatabaseColumn`方法来验证数据库列名的有效性：

```javascript
isValidDatabaseColumn(columnName) {
  const validColumns = [
    'energy', 'active_energy', 'reactive_energy',
    'phase_a_current', 'phase_b_current', 'phase_c_current',
    'phase_a_voltage', 'phase_b_voltage', 'phase_c_voltage',
    'active_power', 'reactive_power', 'apparent_power',
    'power_factor', 'temperature', 'frequency'
    // ... 更多列名
  ];
  return validColumns.includes(columnName);
}
```

## 测试验证

### 测试用例

创建了完整的测试脚本`test_electric_meter_mapping.js`，验证以下功能：

1. **新格式协议配置解析**
2. **中文寄存器名称到英文数据库列的映射**
3. **旧格式协议配置兼容性**
4. **英文参数名兼容性**

### 测试结果

```
✓ A相电流 -> phase_a_current: 12.5
✓ B相电流 -> phase_b_current: 13
✓ C相电流 -> phase_c_current: 12.8
✓ A相电压 -> phase_a_voltage: 220
✓ B相电压 -> phase_b_voltage: 221
✓ C相电压 -> phase_c_voltage: 219
✓ 有功功率 -> active_power: 5.5
✓ 功率因数 -> power_factor: 0.95
✓ 频率 -> frequency: 50
✓ 总电量 -> energy: 1234.56

映射测试结果: 成功
```

## 数据流程

### 修复前的问题流程
```
原始数据 -> 解析 -> 中文寄存器名称 -> 硬编码英文映射 -> ❌ 映射失败 -> 数据丢失
```

### 修复后的正确流程
```
原始数据 -> 解析 -> 中文寄存器名称 -> 动态映射 -> ✅ 正确的数据库列名 -> 数据正确存储
```

## 关键改进点

1. **支持多种协议配置格式**：新格式和旧格式都能正确处理
2. **完整的参数映射**：中文寄存器名称能正确映射到英文数据库列名
3. **向后兼容性**：保持对现有英文参数名的支持
4. **数据验证**：确保只有有效的数据库列名才会被使用
5. **详细的调试日志**：便于问题排查和监控

## 使用指南

### 1. 协议配置建议

推荐使用新的协议配置格式：

```javascript
{
  data_parsing_config: {
    modbus: {
      registers: [
        {
          name: "A相电流",
          address: 0,
          scale: 0.01,
          offset: 0,
          dataType: "uint16",
          unit: "A"
        }
      ]
    }
  }
}
```

### 2. 数据库表结构

确保电表数据表包含以下列：

```sql
-- 电量参数
energy DECIMAL(15,4),
active_energy DECIMAL(15,4),
reactive_energy DECIMAL(15,4),

-- 电流参数
phase_a_current DECIMAL(10,4),
phase_b_current DECIMAL(10,4),
phase_c_current DECIMAL(10,4),

-- 电压参数
phase_a_voltage DECIMAL(10,4),
phase_b_voltage DECIMAL(10,4),
phase_c_voltage DECIMAL(10,4),

-- 功率参数
active_power DECIMAL(15,4),
reactive_power DECIMAL(15,4),
apparent_power DECIMAL(15,4),

-- 其他参数
power_factor DECIMAL(6,4),
temperature DECIMAL(8,2),
frequency DECIMAL(8,4)
```

### 3. 监控和调试

启用调试日志来监控数据映射过程：

```javascript
// 在日志中查看映射过程
[DEBUG] 参数映射: A相电流 -> phase_a_current = 12.5
[DEBUG] 参数映射: 有功功率 -> active_power = 5.5
```

## 预防措施

1. **定期验证映射**：定期检查新增的寄存器是否有对应的数据库列映射
2. **协议配置标准化**：建议统一使用新的协议配置格式
3. **数据完整性检查**：监控数据库中是否有数据缺失或映射错误
4. **测试覆盖**：为新的寄存器类型添加相应的测试用例

## 总结

通过这次修复，解决了电表数据映射的核心问题：

- ✅ 中文寄存器名称能正确映射到英文数据库列
- ✅ 支持新旧两种协议配置格式
- ✅ 保持向后兼容性
- ✅ 提供完整的测试验证
- ✅ 增强了调试和监控能力

现在电表数据能够按照协议配置中的寄存器名称正确写入到数据库的相应列中，不再出现数据都写入第一个数据的问题。