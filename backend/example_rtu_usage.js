/**
 * RTU格式使用示例
 * 展示如何在实际应用中使用Modbus RTU字节流格式
 */

const DevicePollingService = require('./services/devicePollingService');
const ModbusRtuUtils = require('./utils/modbusRtuUtils');
const logger = require('./utils/logger');

/**
 * 示例1: 启动RTU格式的电表轮询
 * 注意：现在轮询间隔必须在设备的Modbus协议配置中设置
 */
async function startRtuPolling() {
  console.log('=== 启动RTU格式电表轮询示例 ===\n');
  
  try {
    const devicePollingService = new DevicePollingService();
    
    // 假设有一个配置了Modbus协议的设备
    const mockDevice = {
      imei: 'TEST_DEVICE_001',
      collection_interval: null, // 不再使用设备级别的采集间隔
      electric_meters: [{
        meter_number: 'METER_001',
        meter_address: 1,
        protocol_config: {
          modbus_registers: [
            {
              name: 'voltage_a',
              address: 31,
              quantity: 2,
              function_code: 3,
              data_type: 'float32_be'
            }
          ],
          polling_interval: 30000 // 轮询间隔必须在这里设置
        }
      }]
    };
    
    // 启动特定设备的轮询
    devicePollingService.startDevicePolling(mockDevice.imei);
    
    console.log('✓ RTU格式电表轮询已启动');
    console.log('  - 轮询间隔: 从Modbus协议配置中读取');
    console.log('  - 数据格式: Modbus RTU字节流');
    console.log('  - 包含CRC校验码');
    console.log('  - 起始地址: 从协议配置中获取，不使用默认地址');
    
  } catch (error) {
    console.error('启动RTU轮询失败:', error);
  }
}

/**
 * 示例2: 手动构造RTU指令
 */
function manualRtuCommands() {
  console.log('\n=== 手动构造RTU指令示例 ===\n');
  
  // 常见的电表RTU指令
  const commands = [
    {
      name: '读取电压',
      slaveAddress: 1,
      startAddress: 31,
      count: 2,
      description: '读取A相电压（地址31-32）'
    },
    {
      name: '读取电流',
      slaveAddress: 1,
      startAddress: 33,
      count: 2,
      description: '读取A相电流（地址33-34）'
    },
    {
      name: '读取功率',
      slaveAddress: 2,
      startAddress: 35,
      count: 4,
      description: '读取总功率（地址35-38）'
    },
    {
      name: '读取电能',
      slaveAddress: 3,
      startAddress: 100,
      count: 2,
      description: '读取总电能（地址100-101）'
    }
  ];
  
  commands.forEach((cmd, index) => {
    console.log(`${index + 1}. ${cmd.name}`);
    console.log(`   描述: ${cmd.description}`);
    
    // 生成RTU指令
    const rtuBuffer = ModbusRtuUtils.buildReadHoldingRegistersRTU(
      cmd.slaveAddress,
      cmd.startAddress,
      cmd.count
    );
    
    const hexString = ModbusRtuUtils.bufferToHexString(rtuBuffer);
    console.log(`   RTU指令: ${hexString}`);
    console.log(`   字节数组: [${Array.from(rtuBuffer).join(', ')}]`);
    console.log();
  });
}

/**
 * 示例3: RTU响应数据解析
 */
function parseRtuResponses() {
  console.log('=== RTU响应数据解析示例 ===\n');
  
  // 模拟不同类型的RTU响应
  const responses = [
    {
      name: '电压数据响应',
      // 从站1，功能码3，4字节数据，220.5V的IEEE754表示
      data: [0x01, 0x03, 0x04, 0x43, 0x5C, 0x80, 0x00],
      description: '电压值: 220.5V'
    },
    {
      name: '电流数据响应', 
      // 从站1，功能码3，4字节数据，15.2A的IEEE754表示
      data: [0x01, 0x03, 0x04, 0x41, 0x73, 0x33, 0x33],
      description: '电流值: 15.2A'
    }
  ];
  
  responses.forEach((resp, index) => {
    console.log(`${index + 1}. ${resp.name}`);
    console.log(`   原始数据: [${resp.data.join(', ')}]`);
    console.log(`   十六进制: ${resp.data.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
    
    try {
      // 注意：这里的响应数据没有包含正确的CRC，实际使用时需要完整的响应
      const buffer = Buffer.from(resp.data);
      console.log(`   数据长度: ${buffer.length} 字节`);
      console.log(`   描述: ${resp.description}`);
    } catch (error) {
      console.log(`   解析失败: ${error.message}`);
    }
    console.log();
  });
}

/**
 * 示例4: CRC校验验证
 */
function crcValidationExamples() {
  console.log('=== CRC校验验证示例 ===\n');
  
  const testCases = [
    {
      name: '标准读取指令',
      data: [0x01, 0x03, 0x00, 0x1F, 0x00, 0x02],
      expectedCrc: 0xCDF5
    },
    {
      name: '不同从站地址',
      data: [0x02, 0x03, 0x00, 0x1F, 0x00, 0x02],
      expectedCrc: null // 计算得出
    },
    {
      name: '写入单个寄存器',
      data: [0x01, 0x06, 0x00, 0x64, 0x00, 0x0A],
      expectedCrc: null // 计算得出
    }
  ];
  
  testCases.forEach((testCase, index) => {
    console.log(`${index + 1}. ${testCase.name}`);
    
    const buffer = Buffer.from(testCase.data);
    const calculatedCrc = ModbusRtuUtils.calculateCRC16(buffer);
    
    console.log(`   数据: ${ModbusRtuUtils.bufferToHexString(buffer)}`);
    console.log(`   计算CRC: 0x${calculatedCrc.toString(16).toUpperCase().padStart(4, '0')}`);
    
    if (testCase.expectedCrc !== null) {
      const isValid = calculatedCrc === testCase.expectedCrc;
      console.log(`   预期CRC: 0x${testCase.expectedCrc.toString(16).toUpperCase().padStart(4, '0')}`);
      console.log(`   校验结果: ${isValid ? '✓ 正确' : '✗ 错误'}`);
    }
    
    // 构造完整的RTU指令（包含CRC）
    const fullCommand = Buffer.concat([buffer, Buffer.alloc(2)]);
    fullCommand.writeUInt16LE(calculatedCrc, buffer.length);
    console.log(`   完整指令: ${ModbusRtuUtils.bufferToHexString(fullCommand)}`);
    console.log();
  });
}

/**
 * 示例5: 实际电表协议配置
 */
function electricMeterProtocolExample() {
  console.log('=== 实际电表协议配置示例 ===\n');
  
  // 典型的智能电表Modbus协议配置
  const protocolConfig = {
    name: '智能电表标准协议',
    communication_config: {
      format: 'rtu',
      baud_rate: 9600,
      data_bits: 8,
      stop_bits: 1,
      parity: 'none'
    },
    readConfig: [
      {
        name: 'voltage_a',
        description: 'A相电压',
        address: 31,
        quantity: 2,
        functionCode: 3,
        dataType: 'float32_be',
        unit: 'V',
        scale: 1
      },
      {
        name: 'voltage_b',
        description: 'B相电压',
        address: 33,
        quantity: 2,
        functionCode: 3,
        dataType: 'float32_be',
        unit: 'V',
        scale: 1
      },
      {
        name: 'voltage_c',
        description: 'C相电压',
        address: 35,
        quantity: 2,
        functionCode: 3,
        dataType: 'float32_be',
        unit: 'V',
        scale: 1
      },
      {
        name: 'current_a',
        description: 'A相电流',
        address: 37,
        quantity: 2,
        functionCode: 3,
        dataType: 'float32_be',
        unit: 'A',
        scale: 1
      },
      {
        name: 'power_total',
        description: '总有功功率',
        address: 45,
        quantity: 2,
        functionCode: 3,
        dataType: 'float32_be',
        unit: 'kW',
        scale: 0.001
      },
      {
        name: 'energy_total',
        description: '总电能',
        address: 100,
        quantity: 2,
        functionCode: 3,
        dataType: 'uint32_be',
        unit: 'kWh',
        scale: 0.01
      }
    ]
  };
  
  console.log('协议配置:');
  console.log(JSON.stringify(protocolConfig, null, 2));
  console.log();
  
  // 模拟电表设备
  const electricMeter = {
    id: 1,
    meter_number: 'EM001',
    meter_address: 1,
    device_id: 1,
    status: 'active'
  };
  
  console.log('生成的RTU指令:');
  console.log('---------------');
  
  const devicePollingService = new DevicePollingService();
  const command = devicePollingService.buildModbusCommand(
    electricMeter,
    protocolConfig,
    { useRtuFormat: true }
  );
  
  if (command.rtu_commands) {
    command.rtu_commands.forEach((cmd, index) => {
      console.log(`${index + 1}. ${cmd.register_name} (${cmd.description})`);
      console.log(`   RTU指令: ${cmd.hex_command}`);
      console.log(`   功能码: ${cmd.function_code}, 地址: ${cmd.start_address}, 数量: ${cmd.count}`);
      console.log();
    });
  }
}

/**
 * 主函数 - 运行所有示例
 */
async function runAllExamples() {
  console.log('Modbus RTU格式完整使用示例\n');
  console.log('=' .repeat(50));
  
  // 运行各个示例
  manualRtuCommands();
  parseRtuResponses();
  crcValidationExamples();
  electricMeterProtocolExample();
  
  console.log('=' .repeat(50));
  console.log('\n所有示例运行完成！');
  console.log('\n使用说明:');
  console.log('1. 在实际应用中，调用 startPolling() 启动RTU格式轮询');
  console.log('2. 确保设备协议配置中包含 communication_config.format = "rtu"');
  console.log('3. RTU指令会自动包含CRC校验码');
  console.log('4. 所有RTU指令都以十六进制字符串格式发送');
  console.log('5. 系统会自动处理字节序和数据类型转换');
}

// 运行示例
if (require.main === module) {
  runAllExamples().catch(console.error);
}

module.exports = {
  startRtuPolling,
  manualRtuCommands,
  parseRtuResponses,
  crcValidationExamples,
  electricMeterProtocolExample
};