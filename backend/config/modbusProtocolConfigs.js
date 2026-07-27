/**
 * Modbus 协议配置示例
 * 包含常见的 Modbus 设备配置模板
 */

const modbusProtocolConfigs = {
  // 智能电表配置
  smartMeter: {
    name: "智能电表 Modbus 协议",
    version: "1.0.0",
    manufacturer_code: "METER_001",
    device_type: "smart_meter",
    description: "支持 Modbus RTU/TCP 的智能电表协议配置",
    data_parsing_config: {
      protocol: "modbus",
      modbus: {
        // 读取配置
        readConfig: [
          {
            functionCode: 4, // 读取输入寄存器
            address: 0,     // 起始地址
            quantity: 31,   // 读取数量（包含所有电力参数）
            description: "电力参数"
          },
          {
            functionCode: 3, // 读取保持寄存器
            address: 100,
            quantity: 10,
            description: "设备状态"
          }
        ],
        // 寄存器映射配置
        registers: [
          // 电能参数
          {
            name: "总有功电能",
            address: 0,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.01,
            offset: 0,
            unit: "kWh",
            description: "总有功电能",
            range: { min: 0, max: 999999 }
          },
          {
            name: "正向有功电能",
            address: 2,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.01,
            offset: 0,
            unit: "kWh",
            description: "正向有功电能",
            range: { min: 0, max: 999999 }
          },
          {
            name: "反向有功电能",
            address: 4,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.01,
            offset: 0,
            unit: "kWh",
            description: "反向有功电能",
            range: { min: 0, max: 999999 }
          },
          // 电流参数
          {
            name: "A相电流",
            address: 6,
            dataType: "uint16",
            scale: 0.01,
            offset: 0,
            unit: "A",
            description: "A相电流",
            range: { min: 0, max: 100 }
          },
          {
            name: "B相电流",
            address: 7,
            dataType: "uint16",
            scale: 0.01,
            offset: 0,
            unit: "A",
            description: "B相电流",
            range: { min: 0, max: 100 }
          },
          {
            name: "C相电流",
            address: 8,
            dataType: "uint16",
            scale: 0.01,
            offset: 0,
            unit: "A",
            description: "C相电流",
            range: { min: 0, max: 100 }
          },
          // 相电压参数
          {
            name: "A相电压",
            address: 9,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "V",
            description: "A相电压",
            range: { min: 0, max: 500 }
          },
          {
            name: "B相电压",
            address: 10,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "V",
            description: "B相电压",
            range: { min: 0, max: 500 }
          },
          {
            name: "C相电压",
            address: 11,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "V",
            description: "C相电压",
            range: { min: 0, max: 500 }
          },
          // 线电压参数
          {
            name: "AB线电压",
            address: 12,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "V",
            description: "AB线电压",
            range: { min: 0, max: 500 }
          },
          {
            name: "BC线电压",
            address: 14,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "V",
            description: "BC线电压",
            range: { min: 0, max: 500 }
          },
          {
            name: "CA线电压",
            address: 13,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "V",
            description: "CA线电压",
            range: { min: 0, max: 500 }
          },
          // 功率参数
          {
            name: "A相功率",
            address: 15,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.001,
            offset: 0,
            unit: "kW",
            description: "A相功率",
            range: { min: 0, max: 1000 }
          },
          {
            name: "B相功率",
            address: 17,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.001,
            offset: 0,
            unit: "kW",
            description: "B相功率",
            range: { min: 0, max: 1000 }
          },
          {
            name: "C相功率",
            address: 19,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.001,
            offset: 0,
            unit: "kW",
            description: "C相功率",
            range: { min: 0, max: 1000 }
          },
          {
            name: "ABC相总功率",
            address: 21,
            dataType: "uint32",
            length: 2,
            byteOrder: "BE",
            scale: 0.001,
            offset: 0,
            unit: "kW",
            description: "ABC相总功率",
            range: { min: 0, max: 3000 }
          },
          // 功率因数参数
          {
            name: "A相功率因数",
            address: 23,
            dataType: "int16",
            scale: 0.001,
            offset: 0,
            unit: "",
            description: "A相功率因数",
            range: { min: -1, max: 1 }
          },
          {
            name: "B相功率因数",
            address: 24,
            dataType: "int16",
            scale: 0.001,
            offset: 0,
            unit: "",
            description: "B相功率因数",
            range: { min: -1, max: 1 }
          },
          {
            name: "C相功率因数",
            address: 25,
            dataType: "int16",
            scale: 0.001,
            offset: 0,
            unit: "",
            description: "C相功率因数",
            range: { min: -1, max: 1 }
          },
          {
            name: "ABC相总功率因数",
            address: 26,
            dataType: "int16",
            scale: 0.001,
            offset: 0,
            unit: "",
            description: "ABC相总功率因数",
            range: { min: -1, max: 1 }
          },
          // 温度参数
          {
            name: "A相温度",
            address: 27,
            dataType: "int16",
            scale: 0.1,
            offset: 0,
            unit: "°C",
            description: "A相温度",
            range: { min: -40, max: 85 }
          },
          {
            name: "B相温度",
            address: 28,
            dataType: "int16",
            scale: 0.1,
            offset: 0,
            unit: "°C",
            description: "B相温度",
            range: { min: -40, max: 85 }
          },
          {
            name: "C相温度",
            address: 29,
            dataType: "int16",
            scale: 0.1,
            offset: 0,
            unit: "°C",
            description: "C相温度",
            range: { min: -40, max: 85 }
          },
          // 其他参数
          {
            name: "频率",
            address: 30,
            dataType: "uint16",
            scale: 0.01,
            offset: 0,
            unit: "Hz",
            description: "频率",
            range: { min: 45, max: 65 }
          },
          {
            name: "device_status",
            address: 100,
            dataType: "bitfield",
            bitMap: [
              { name: "power_on", position: 0, description: "电源状态" },
              { name: "alarm", position: 1, description: "报警状态" },
              { name: "communication_error", position: 2, description: "通信错误" },
              { name: "calibration_error", position: 3, description: "校准错误" }
            ],
            description: "设备状态位"
          }
        ]
      }
    },
    command_config: {
      protocol: "modbus",
      modbus: {
        commands: [
          {
            name: "reset_energy",
            description: "重置电能计数",
            functionCode: 6, // 写入单个寄存器
            address: 200,
            dataType: "uint16",
            value: 1,
            confirmation: true
          },
          {
            name: "set_demand_period",
            description: "设置需量周期",
            functionCode: 6,
            address: 201,
            dataType: "uint16",
            range: { min: 1, max: 60 },
            unit: "分钟"
          },
          {
            name: "calibrate_voltage",
            description: "校准电压",
            functionCode: 16, // 写入多个寄存器
            address: 300,
            dataType: "float32",
            length: 2,
            byteOrder: "BE",
            range: { min: 0.5, max: 1.5 }
          }
        ]
      }
    },
    validation_rules: {
      required_fields: ["总有功电能", "正向有功电能", "A相电流", "B相电流", "C相电流", "A相电压", "B相电压", "C相电压", "ABC相总功率"],
      data_validation: {
        voltage_range: {
          fields: ["A相电压", "B相电压", "C相电压"],
          min: 180,
          max: 250,
          warning_threshold: 10
        },
        line_voltage_range: {
          fields: ["AB线电压", "BC线电压", "CA线电压"],
          min: 310,
          max: 430,
          warning_threshold: 15
        },
        current_balance: {
          fields: ["A相电流", "B相电流", "C相电流"],
          description: "三相电流平衡检查",
          tolerance: 0.1
        },
        power_consistency: {
          description: "功率一致性检查",
          tolerance: 0.05
        },
        power_factor_range: {
          fields: ["A相功率因数", "B相功率因数", "C相功率因数", "ABC相总功率因数"],
          min: -1,
          max: 1,
          warning_threshold: 0.85
        },
        temperature_monitoring: {
          fields: ["A相温度", "B相温度", "C相温度"],
          max: 70,
          critical: 85
        }
      },
      alert_rules: [
        {
          condition: "A相电压 < 200 OR B相电压 < 200 OR C相电压 < 200",
          level: "warning",
          message: "相电压偏低"
        },
        {
          condition: "AB线电压 < 350 OR BC线电压 < 350 OR CA线电压 < 350",
          level: "warning",
          message: "线电压偏低"
        },
        {
          condition: "AB线电压 > 420 OR BC线电压 > 420 OR CA线电压 > 420",
          level: "error",
          message: "线电压过高"
        },
        {
          condition: "A相温度 > 70 OR B相温度 > 70 OR C相温度 > 70",
          level: "critical",
          message: "相温度过高"
        },
        {
          condition: "A相功率因数 < 0.85 OR B相功率因数 < 0.85 OR C相功率因数 < 0.85",
          level: "warning",
          message: "功率因数偏低"
        },
        {
          condition: "A相电流 > 80 OR B相电流 > 80 OR C相电流 > 80",
          level: "warning",
          message: "相电流过高"
        }
      ]
    }
  },

  // 环境监测设备配置
  environmentSensor: {
    name: "环境监测设备 Modbus 协议",
    version: "1.0.0",
    manufacturer_code: "ENV_001",
    device_type: "environment_sensor",
    description: "支持温湿度、PM2.5等环境参数监测的Modbus设备",
    data_parsing_config: {
      protocol: "modbus",
      modbus: {
        readConfig: [
          {
            functionCode: 4,
            address: 0,
            quantity: 10,
            description: "环境参数"
          }
        ],
        registers: [
          {
            name: "temperature",
            address: 0,
            dataType: "int16",
            scale: 0.1,
            offset: 0,
            unit: "°C",
            description: "温度",
            range: { min: -40, max: 80 }
          },
          {
            name: "humidity",
            address: 1,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "%RH",
            description: "湿度",
            range: { min: 0, max: 100 }
          },
          {
            name: "pm25",
            address: 2,
            dataType: "uint16",
            scale: 1,
            offset: 0,
            unit: "μg/m³",
            description: "PM2.5浓度",
            range: { min: 0, max: 500 }
          },
          {
            name: "pm10",
            address: 3,
            dataType: "uint16",
            scale: 1,
            offset: 0,
            unit: "μg/m³",
            description: "PM10浓度",
            range: { min: 0, max: 500 }
          },
          {
            name: "co2",
            address: 4,
            dataType: "uint16",
            scale: 1,
            offset: 0,
            unit: "ppm",
            description: "CO2浓度",
            range: { min: 0, max: 5000 }
          },
          {
            name: "atmospheric_pressure",
            address: 5,
            dataType: "uint16",
            scale: 0.1,
            offset: 0,
            unit: "kPa",
            description: "大气压力",
            range: { min: 80, max: 110 }
          }
        ]
      }
    },
    command_config: {
      protocol: "modbus",
      modbus: {
        commands: [
          {
            name: "calibrate_sensor",
            description: "传感器校准",
            functionCode: 6,
            address: 100,
            dataType: "uint16",
            value: 1
          },
          {
            name: "set_sampling_interval",
            description: "设置采样间隔",
            functionCode: 6,
            address: 101,
            dataType: "uint16",
            range: { min: 1, max: 3600 },
            unit: "秒"
          }
        ]
      }
    },
    validation_rules: {
      required_fields: ["temperature", "humidity"],
      data_validation: {
        temperature_humidity_correlation: {
          description: "温湿度相关性检查"
        }
      },
      alert_rules: [
        {
          condition: "temperature > 35",
          level: "warning",
          message: "温度过高"
        },
        {
          condition: "pm25 > 75",
          level: "warning",
          message: "PM2.5浓度超标"
        },
        {
          condition: "co2 > 1000",
          level: "warning",
          message: "CO2浓度过高"
        }
      ]
    }
  },

  // 通用 Modbus 设备配置模板
  genericModbus: {
    name: "通用 Modbus 设备协议",
    version: "1.0.0",
    manufacturer_code: "GENERIC",
    device_type: "generic_modbus",
    description: "通用的Modbus设备协议配置模板",
    data_parsing_config: {
      protocol: "modbus",
      modbus: {
        readConfig: [
          {
            functionCode: 3,
            address: 0,
            quantity: 10,
            description: "保持寄存器"
          },
          {
            functionCode: 4,
            address: 0,
            quantity: 10,
            description: "输入寄存器"
          },
          {
            functionCode: 1,
            address: 0,
            quantity: 16,
            description: "线圈状态"
          },
          {
            functionCode: 2,
            address: 0,
            quantity: 16,
            description: "离散输入"
          }
        ],
        registers: [
          {
            name: "register_0",
            address: 0,
            dataType: "uint16",
            scale: 1,
            offset: 0,
            description: "寄存器0"
          }
        ],
        coils: [
          {
            name: "coil_0",
            address: 0,
            description: "线圈0"
          }
        ]
      }
    },
    command_config: {
      protocol: "modbus",
      modbus: {
        commands: [
          {
            name: "write_single_coil",
            description: "写入单个线圈",
            functionCode: 5,
            address: 0,
            dataType: "boolean"
          },
          {
            name: "write_single_register",
            description: "写入单个寄存器",
            functionCode: 6,
            address: 0,
            dataType: "uint16"
          }
        ]
      }
    },
    validation_rules: {
      required_fields: [],
      data_validation: {},
      alert_rules: []
    }
  }
};

module.exports = modbusProtocolConfigs;