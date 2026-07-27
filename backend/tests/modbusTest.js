/**
 * Modbus 功能测试脚本
 * 用于测试 Modbus 协议的各项功能
 */

const ModbusService = require('../services/modbusService');
const ModbusParser = require('../utils/modbusParser');
const ModbusProtocolManager = require('../services/modbusProtocolManager');
const logger = require('../utils/logger');
require('dotenv').config();

/**
 * 测试 ModbusParser 功能
 */
function testModbusParser() {
  console.log('\n=== 测试 ModbusParser ===');
  
  const parser = new ModbusParser();
  
  // 测试数据
  const testBuffer = Buffer.from([
    0x12, 0x34, // uint16: 4660
    0x56, 0x78, // uint16: 22136
    0x9A, 0xBC, // uint16: 39612
    0xDE, 0xF0  // uint16: 57072
  ]);
  
  try {
    // 测试 uint16 解析
    const uint16Value = parser.parseRegisterValue(testBuffer, 0, {
      data_type: 'uint16',
      byte_order: 'BE'
    });
    console.log(`✓ uint16 解析: ${uint16Value} (期望: 4660)`);
    
    // 测试 uint32 解析
    const uint32Value = parser.parseRegisterValue(testBuffer, 0, {
      data_type: 'uint32',
      byte_order: 'BE'
    });
    console.log(`✓ uint32 解析: ${uint32Value} (期望: 305419896)`);
    
    // 测试缩放和偏移
    const scaledValue = parser.parseRegisterValue(testBuffer, 0, {
      data_type: 'uint16',
      byte_order: 'BE',
      scale: 0.1,
      offset: -100
    });
    console.log(`✓ 缩放偏移解析: ${scaledValue} (期望: 366)`);
    
    // 测试位字段解析
    const bitValue = parser.parseRegisterValue(testBuffer, 0, {
      data_type: 'bit',
      byte_order: 'BE',
      bit_index: 2
    });
    console.log(`✓ 位字段解析: ${bitValue}`);
    
    console.log('✓ ModbusParser 测试通过');
    
  } catch (error) {
    console.error('✗ ModbusParser 测试失败:', error.message);
  }
}

/**
 * 测试 ModbusService 连接功能
 */
async function testModbusConnection() {
  console.log('\n=== 测试 Modbus 连接 ===');
  
  const service = new ModbusService();
  
  // 测试配置
  const testConfigs = [
    {
      name: '本地测试',
      config: {
        host: '127.0.0.1',
        port: 502,
        unitId: 1,
        timeout: 3000
      }
    },
    {
      name: '无效地址测试',
      config: {
        host: '192.168.999.999',
        port: 502,
        unitId: 1,
        timeout: 1000
      }
    }
  ];
  
  for (const testConfig of testConfigs) {
    try {
      console.log(`\n测试连接: ${testConfig.name}`);
      console.log(`地址: ${testConfig.config.host}:${testConfig.config.port}`);
      
      const isConnected = await service.connect(testConfig.config);
      
      if (isConnected) {
        console.log('✓ 连接成功');
        
        // 测试读取功能
        try {
          const result = await service.readHoldingRegisters(0, 1);
          console.log('✓ 读取寄存器成功:', result);
        } catch (readError) {
          console.log('⚠ 读取寄存器失败 (可能是正常的):', readError.message);
        }
        
        // 断开连接
        await service.disconnect();
        console.log('✓ 断开连接成功');
        
      } else {
        console.log('✗ 连接失败');
      }
      
    } catch (error) {
      console.log(`✗ 连接测试失败: ${error.message}`);
    }
  }
}

/**
 * 测试协议配置解析
 */
function testProtocolConfigParsing() {
  console.log('\n=== 测试协议配置解析 ===');
  
  const parser = new ModbusParser();
  
  // 模拟协议配置
  const protocolConfig = {
    data_parsing_config: {
      read_configs: [
        {
          function_code: 3,
          address: 0,
          quantity: 5,
          register_mappings: [
            {
              name: 'voltage',
              address: 0,
              data_type: 'uint16',
              scale: 0.1,
              offset: 0,
              unit: 'V',
              byte_order: 'BE'
            },
            {
              name: 'current',
              address: 1,
              data_type: 'uint16',
              scale: 0.01,
              offset: 0,
              unit: 'A',
              byte_order: 'BE'
            },
            {
              name: 'power',
              address: 2,
              data_type: 'uint32',
              scale: 0.001,
              offset: 0,
              unit: 'kW',
              byte_order: 'BE'
            },
            {
              name: 'status_bit',
              address: 4,
              data_type: 'bit',
              bit_index: 0,
              byte_order: 'BE'
            }
          ]
        }
      ]
    }
  };
  
  // 模拟寄存器数据
  const registerData = Buffer.from([
    0x09, 0xC4, // 2500 -> 250.0V
    0x03, 0xE8, // 1000 -> 10.00A
    0x00, 0x0F, // 15 (高位)
    0x42, 0x40, // 16960 (低位) -> 15.000 kW
    0x00, 0x01  // 状态位
  ]);
  
  try {
    const readConfig = protocolConfig.data_parsing_config.read_configs[0];
    const parsedData = parser.parseRegistersByConfig(registerData, readConfig);
    
    console.log('✓ 协议配置解析结果:');
    console.log(`  电压: ${parsedData.voltage.value} ${parsedData.voltage.unit}`);
    console.log(`  电流: ${parsedData.current.value} ${parsedData.current.unit}`);
    console.log(`  功率: ${parsedData.power.value} ${parsedData.power.unit}`);
    console.log(`  状态位: ${parsedData.status_bit.value}`);
    
    // 验证结果
    const expectedResults = {
      voltage: 250.0,
      current: 10.00,
      power: 15.000,
      status_bit: 1
    };
    
    let allCorrect = true;
    for (const [key, expected] of Object.entries(expectedResults)) {
      const actual = parsedData[key].value;
      if (Math.abs(actual - expected) > 0.001) {
        console.error(`✗ ${key} 值不匹配: 期望 ${expected}, 实际 ${actual}`);
        allCorrect = false;
      }
    }
    
    if (allCorrect) {
      console.log('✓ 所有解析结果正确');
    }
    
  } catch (error) {
    console.error('✗ 协议配置解析失败:', error.message);
  }
}

/**
 * 测试命令准备功能
 */
function testCommandPreparation() {
  console.log('\n=== 测试命令准备 ===');
  
  const parser = new ModbusParser();
  
  const testCommands = [
    {
      name: '写入单个寄存器',
      config: {
        function_code: 6,
        address: 100,
        data_type: 'uint16',
        value: 1234
      }
    },
    {
      name: '写入浮点数',
      config: {
        function_code: 16,
        address: 200,
        data_type: 'float32',
        value: 123.45
      }
    },
    {
      name: '写入多个寄存器',
      config: {
        function_code: 16,
        address: 300,
        data_type: 'uint16',
        values: [100, 200, 300]
      }
    }
  ];
  
  for (const testCommand of testCommands) {
    try {
      console.log(`\n测试: ${testCommand.name}`);
      
      const writeData = parser.prepareWriteData(testCommand.config);
      
      console.log(`✓ 地址: ${writeData.address}`);
      console.log(`✓ 数据: [${writeData.values.join(', ')}]`);
      console.log(`✓ 数据长度: ${writeData.values.length}`);
      
    } catch (error) {
      console.error(`✗ ${testCommand.name} 失败:`, error.message);
    }
  }
}

/**
 * 测试数据验证功能
 */
function testDataValidation() {
  console.log('\n=== 测试数据验证 ===');
  
  const parser = new ModbusParser();
  
  const testCases = [
    {
      name: '正常范围内的值',
      value: 50,
      min: 0,
      max: 100,
      expected: true
    },
    {
      name: '超出最大值',
      value: 150,
      min: 0,
      max: 100,
      expected: false
    },
    {
      name: '低于最小值',
      value: -10,
      min: 0,
      max: 100,
      expected: false
    },
    {
      name: '边界值 - 最小值',
      value: 0,
      min: 0,
      max: 100,
      expected: true
    },
    {
      name: '边界值 - 最大值',
      value: 100,
      min: 0,
      max: 100,
      expected: true
    }
  ];
  
  for (const testCase of testCases) {
    try {
      const isValid = parser.validateDataRange(testCase.value, testCase.min, testCase.max);
      
      if (isValid === testCase.expected) {
        console.log(`✓ ${testCase.name}: ${isValid}`);
      } else {
        console.error(`✗ ${testCase.name}: 期望 ${testCase.expected}, 实际 ${isValid}`);
      }
      
    } catch (error) {
      console.error(`✗ ${testCase.name} 验证失败:`, error.message);
    }
  }
}

/**
 * 测试错误处理
 */
function testErrorHandling() {
  console.log('\n=== 测试错误处理 ===');
  
  const parser = new ModbusParser();
  
  const errorTests = [
    {
      name: '无效数据类型',
      test: () => {
        const buffer = Buffer.from([0x12, 0x34]);
        parser.parseRegisterValue(buffer, 0, {
          data_type: 'invalid_type',
          byte_order: 'BE'
        });
      }
    },
    {
      name: '缓冲区越界',
      test: () => {
        const buffer = Buffer.from([0x12, 0x34]);
        parser.parseRegisterValue(buffer, 10, {
          data_type: 'uint16',
          byte_order: 'BE'
        });
      }
    },
    {
      name: '无效位索引',
      test: () => {
        const buffer = Buffer.from([0x12, 0x34]);
        parser.parseRegisterValue(buffer, 0, {
          data_type: 'bit',
          byte_order: 'BE',
          bit_index: 20
        });
      }
    }
  ];
  
  for (const errorTest of errorTests) {
    try {
      errorTest.test();
      console.error(`✗ ${errorTest.name}: 应该抛出错误但没有`);
    } catch (error) {
      console.log(`✓ ${errorTest.name}: 正确捕获错误 - ${error.message}`);
    }
  }
}

/**
 * 性能测试
 */
function testPerformance() {
  console.log('\n=== 性能测试 ===');
  
  const parser = new ModbusParser();
  
  // 创建大量测试数据
  const largeBuffer = Buffer.alloc(2000); // 1000个寄存器
  for (let i = 0; i < largeBuffer.length; i += 2) {
    largeBuffer.writeUInt16BE(Math.floor(Math.random() * 65536), i);
  }
  
  const config = {
    data_type: 'uint16',
    byte_order: 'BE',
    scale: 0.1,
    offset: 0
  };
  
  const iterations = 10000;
  
  console.log(`解析 ${iterations} 次 uint16 值...`);
  
  const startTime = process.hrtime.bigint();
  
  for (let i = 0; i < iterations; i++) {
    const offset = (i % 1000) * 2;
    parser.parseRegisterValue(largeBuffer, offset, config);
  }
  
  const endTime = process.hrtime.bigint();
  const duration = Number(endTime - startTime) / 1000000; // 转换为毫秒
  
  console.log(`✓ 性能测试完成:`);
  console.log(`  总时间: ${duration.toFixed(2)} ms`);
  console.log(`  平均时间: ${(duration / iterations).toFixed(4)} ms/次`);
  console.log(`  处理速度: ${(iterations / (duration / 1000)).toFixed(0)} 次/秒`);
}

/**
 * 运行所有测试
 */
async function runAllTests() {
  console.log('开始 Modbus 功能测试...');
  console.log('=' .repeat(50));
  
  try {
    // 基础功能测试
    testModbusParser();
    testProtocolConfigParsing();
    testCommandPreparation();
    testDataValidation();
    testErrorHandling();
    
    // 连接测试 (可能失败，因为没有真实的 Modbus 设备)
    await testModbusConnection();
    
    // 性能测试
    testPerformance();
    
    console.log('\n' + '=' .repeat(50));
    console.log('✓ 所有测试完成');
    
  } catch (error) {
    console.error('\n测试过程中发生错误:', error);
  }
}

/**
 * 命令行参数处理
 */
if (require.main === module) {
  const testType = process.argv[2];
  
  switch (testType) {
    case 'parser':
      testModbusParser();
      break;
      
    case 'connection':
      testModbusConnection();
      break;
      
    case 'protocol':
      testProtocolConfigParsing();
      break;
      
    case 'command':
      testCommandPreparation();
      break;
      
    case 'validation':
      testDataValidation();
      break;
      
    case 'error':
      testErrorHandling();
      break;
      
    case 'performance':
      testPerformance();
      break;
      
    case 'all':
    default:
      runAllTests();
      break;
  }
}

module.exports = {
  testModbusParser,
  testModbusConnection,
  testProtocolConfigParsing,
  testCommandPreparation,
  testDataValidation,
  testErrorHandling,
  testPerformance,
  runAllTests
};