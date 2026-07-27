# 照明控制协议配置添加指南

## 概述
基于照明控制页面中使用的JSON协议，我已经为您准备了完整的协议配置。

## 协议配置详情

### 基本信息
- **协议名称**: 照明开关控制协议
- **版本**: 1.0.0
- **厂商代码**: BNDK
- **设备类型**: 照明开关
- **描述**: 用于照明开关设备的控制协议，支持单开、双开、三开模式，包含开关控制、重启和统计功能

### 数据解析配置
```json
{
  "voltage": {
    "type": "number",
    "unit": "V",
    "precision": 3,
    "description": "电压值"
  },
  "current": {
    "type": "number",
    "unit": "A",
    "precision": 3,
    "description": "电流值"
  },
  "power": {
    "type": "number",
    "unit": "W",
    "precision": 3,
    "description": "功率值"
  },
  "energy": {
    "type": "number",
    "unit": "KW·H",
    "precision": 3,
    "description": "累计用电量"
  }
}
```

### 命令配置
```json
{
  "single_switch": {
    "on": {
      "type": "event",
      "key2": 1
    },
    "off": {
      "type": "event",
      "key2": 0
    }
  },
  "double_switch": {
    "all_on": {
      "type": "event",
      "key1": 1,
      "key3": 1
    },
    "all_off": {
      "type": "event",
      "key1": 0,
      "key3": 0
    },
    "switch1_on": {
      "type": "event",
      "key1": 1
    },
    "switch1_off": {
      "type": "event",
      "key1": 0
    },
    "switch2_on": {
      "type": "event",
      "key3": 1
    },
    "switch2_off": {
      "type": "event",
      "key3": 0
    }
  },
  "triple_switch": {
    "all_on": {
      "type": "event",
      "key1": 1,
      "key2": 1,
      "key3": 1
    },
    "all_off": {
      "type": "event",
      "key1": 0,
      "key2": 0,
      "key3": 0
    },
    "switch1_on": {
      "type": "event",
      "key1": 1
    },
    "switch1_off": {
      "type": "event",
      "key1": 0
    },
    "switch2_on": {
      "type": "event",
      "key2": 1
    },
    "switch2_off": {
      "type": "event",
      "key2": 0
    },
    "switch3_on": {
      "type": "event",
      "key3": 1
    },
    "switch3_off": {
      "type": "event",
      "key3": 0
    }
  },
  "common_commands": {
    "restart": {
      "type": "setting",
      "system": "restart"
    },
    "statistic": {
      "type": "statistic"
    }
  }
}
```

### 验证规则
```json
{
  "voltage": {
    "type": "range",
    "min": 0,
    "max": 500,
    "message": "电压值必须在0-500V之间"
  },
  "current": {
    "type": "range",
    "min": 0,
    "max": 100,
    "message": "电流值必须在0-100A之间"
  },
  "power": {
    "type": "range",
    "min": 0,
    "max": 50000,
    "message": "功率值必须在0-50000W之间"
  },
  "energy": {
    "type": "number",
    "min": 0,
    "message": "累计用电量不能为负数"
  }
}
```

## 添加步骤

1. 打开前端应用: http://localhost:3013/
2. 登录系统
3. 导航到「协议配置管理」页面
4. 点击「添加协议配置」按钮
5. 填写基本信息:
   - 协议名称: `照明开关控制协议`
   - 版本: `1.0.0`
   - 厂商: 选择 `BNDK` (如果没有请先添加厂商)
   - 设备类型: `照明开关`
   - 描述: `用于照明开关设备的控制协议，支持单开、双开、三开模式，包含开关控制、重启和统计功能`
   - 状态: `启用`
6. 在「数据解析配置」标签页中，复制粘贴上面的数据解析配置JSON
7. 在「命令配置」标签页中，复制粘贴上面的命令配置JSON
8. 在「验证规则」标签页中，可以手动添加验证规则或直接保存
9. 点击「保存」按钮

## 协议说明

### 设备控制指令

#### 单开照明开关
- **开启**: `{"type": "event", "key2": 1}`
- **关闭**: `{"type": "event", "key2": 0}`

#### 双开照明开关
- **全部开启**: `{"type": "event", "key1": 1, "key3": 1}`
- **全部关闭**: `{"type": "event", "key1": 0, "key3": 0}`
- **单开开关1**: `{"type": "event", "key1": 1}`
- **单关开关1**: `{"type": "event", "key1": 0}`
- **单开开关2**: `{"type": "event", "key3": 1}`
- **单关开关2**: `{"type": "event", "key3": 0}`

#### 三开照明开关
- **全部开启**: `{"type": "event", "key1": 1, "key2": 1, "key3": 1}`
- **全部关闭**: `{"type": "event", "key1": 0, "key2": 0, "key3": 0}`
- **单开开关1**: `{"type": "event", "key1": 1}`
- **单关开关1**: `{"type": "event", "key1": 0}`
- **单开开关2**: `{"type": "event", "key2": 1}`
- **单关开关2**: `{"type": "event", "key2": 0}`
- **单开开关3**: `{"type": "event", "key3": 1}`
- **单关开关3**: `{"type": "event", "key3": 0}`

### 通用指令
- **重启设备**: `{"type": "setting", "system": "restart"}`
- **获取统计**: `{"type": "statistic"}`

### 数据字段
- **voltage**: 电压值 (V)
- **current**: 电流值 (A)
- **power**: 功率值 (W)
- **energy**: 累计用电量 (KW·H)

完整的协议配置JSON文件已保存在: `/home/ls/iot/lighting_protocol_config.json`