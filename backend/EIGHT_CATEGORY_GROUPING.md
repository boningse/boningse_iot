# 电表数据八个分组功能说明

## 概述

本文档描述了电表数据采集系统中新实现的八个分组功能，将原来的七个分组扩展为八个独立分组，提供更精细的数据分类和查询优化。

## 八个分组类别

### 1. 功率因数分组
- **关键词**: 功率因数, power_factor, pf, 因数, cos, a相功率因数, b相功率因数, c相功率因数, 总功率因数
- **用途**: 电力系统功率因数相关参数
- **典型寄存器**: A相功率因数, B相功率因数, C相功率因数, 总功率因数

### 2. 电量分组
- **关键词**: 电能, 电量, energy, kwh, 总有功电能, 正向有功电能, 反向有功电能, 有功电能
- **用途**: 电能计量相关参数
- **典型寄存器**: 总有功电能, 正向有功电能, 反向有功电能

### 3. 相电压分组
- **关键词**: 相电压, a相电压, b相电压, c相电压
- **用途**: 三相电压中的相电压参数
- **典型寄存器**: A相电压, B相电压, C相电压

### 4. 线电压分组
- **关键词**: 线电压, ab相电压, ac相电压, bc相电压, ab线电压, bc线电压, ca线电压
- **用途**: 三相电压中的线电压参数
- **典型寄存器**: AB线电压, BC线电压, CA线电压

### 5. 电流分组
- **关键词**: 电流, current, 相电流, a相电流, b相电流, c相电流
- **用途**: 电流测量相关参数
- **典型寄存器**: A相电流, B相电流, C相电流

### 6. 功率分组
- **关键词**: 功率, power, kw, 有功功率, active_power, a相有功功率, b相有功功率, c相有功功率, 总有功功率
- **用途**: 功率测量相关参数
- **典型寄存器**: A相有功功率, B相有功功率, C相有功功率, 总有功功率

### 7. 频率分组
- **关键词**: 频率, frequency, hz, freq
- **用途**: 电网频率相关参数
- **典型寄存器**: 频率

### 8. 温度分组
- **关键词**: 温度, temperature, °c, temp, a相温度, b相温度, c相温度
- **用途**: 设备温度监测相关参数
- **典型寄存器**: A相温度, B相温度, C相温度

## 分组规则和限制

### 分组优先级
分组按以下优先级顺序进行匹配：
1. 功率因数
2. 电量
3. 相电压
4. 线电压
5. 电流
6. 功率
7. 频率
8. 温度

### 分组限制
- **每组最多4个寄存器**: 确保查询效率和数据包大小合理
- **每组最多8个数据位**: 控制单次查询的数据量，避免超出设备处理能力
- **空分组跳过**: 如果某个分组中没有对应的寄存器，则不会生成查询命令

### 批量优化规则
- **地址连续性**: 优先合并地址连续的寄存器
- **间隙容忍**: 允许小间隙（可配置）的寄存器合并
- **数据类型兼容**: 确保合并的寄存器数据类型兼容

## 配置参数

### 协议配置示例
```json
{
  "modbus_config": {
    "enableBatchOptimization": true,
    "maxBatchSize": 10,
    "maxGapSize": 2,
    "maxRegisterCount": 4,
    "voltageGrouping": true
  }
}
```

### 参数说明
- `enableBatchOptimization`: 是否启用批量优化
- `maxBatchSize`: 单次查询最大寄存器数量
- `maxGapSize`: 允许的最大地址间隙
- `maxRegisterCount`: 每组最大寄存器数量（硬限制为4）
- `voltageGrouping`: 是否启用电压智能分组

## 实现特性

### 1. 智能电压分组
- 相电压和线电压分别处理
- 自动检测寄存器的count属性（1或2个数据位）
- 根据地址连续性进行最优分组

### 2. 数据位计算
- 严格按照寄存器的count属性计算数据位数
- 支持混合count的寄存器合并
- 确保总数据位数不超过8个

### 3. 空分组处理
- 自动跳过没有寄存器的分组
- 避免生成无效的查询命令
- 提高系统效率

### 4. 验证和监控
- 实时验证分组限制
- 详细的日志记录
- 分组统计信息

## 使用示例

### 基本使用
```javascript
const electricMeterService = new ElectricMeterMqttService();

// 寄存器配置
const registers = [
  { address: 20, name: 'A相功率因数', data_type: 'uint16', count: 1, function_code: 3 },
  { address: 0, name: '总有功电能', data_type: 'uint32', count: 2, function_code: 3 },
  { address: 10, name: 'A相电压', data_type: 'uint16', count: 1, function_code: 3 },
  { address: 13, name: 'AB线电压', data_type: 'uint16', count: 1, function_code: 3 },
  // ... 更多寄存器
];

// 协议配置
const protocolConfig = {
  name: "智能电表协议",
  modbus_config: {
    enableBatchOptimization: true,
    maxBatchSize: 10,
    maxGapSize: 2,
    maxRegisterCount: 4,
    voltageGrouping: true
  }
};

// 执行分组
const groupedQueries = electricMeterService.groupRegistersByCategory(
  registers, 
  protocolConfig
);
```

### 分组结果示例
```javascript
// 返回的分组查询示例
[
  {
    "function_code": 3,
    "start_address": 20,
    "quantity": 4,
    "category": "功率因数",
    "category_description": "功率因数参数组1",
    "register_names": ["A相功率因数", "B相功率因数", "C相功率因数", "总功率因数"],
    "register_mapping": [
      {
        "name": "A相功率因数",
        "address": 20,
        "count": 1,
        "offset": 0
      },
      // ... 更多映射
    ]
  },
  // ... 其他分组
]
```

## 测试验证

### 运行测试
```bash
node test_eight_category_grouping.js
```

### 测试内容
1. **八个分组测试**: 验证所有8个分组的正确分类
2. **空分组测试**: 验证空分组的正确处理
3. **限制验证**: 验证4个寄存器和8个数据位的限制
4. **批量优化**: 验证连续寄存器的合并逻辑

## 日志监控

### 关键日志
- `处理类别: [分组名称], 寄存器数量: [数量]`
- `批量查询[序号]验证`: 包含详细的验证信息
- `按类别分组完成`: 总体统计信息

### 监控指标
- 各分组的寄存器数量分布
- 查询数量和效率
- 分组限制合规性
- 数据位使用情况

## 故障排除

### 常见问题

1. **寄存器无法分类**
   - 检查寄存器名称是否包含关键词
   - 确认关键词匹配的优先级
   - 查看日志中的分类警告

2. **分组超限**
   - 检查单组寄存器数量是否超过4个
   - 验证数据位总数是否超过8个
   - 调整批量优化参数

3. **空分组问题**
   - 确认寄存器配置正确
   - 检查关键词匹配逻辑
   - 验证协议配置

### 调试建议
- 启用详细日志记录
- 使用测试脚本验证配置
- 监控分组统计信息
- 检查寄存器映射关系

## 版本历史

### v2.0.0 (当前版本)
- 实现八个独立分组
- 添加相电压和线电压分离
- 增强分组限制控制
- 优化批量查询逻辑

### v1.0.0 (原版本)
- 七个分组实现
- 基础批量优化
- 电压统一处理

## 相关文件

- `services/electricMeterMqttService.js`: 主要实现文件
- `test_eight_category_grouping.js`: 测试脚本
- `config/modbusProtocolConfigs.js`: 协议配置示例
- `ELECTRIC_METER_PROTOCOL_FIX.md`: 相关修复文档