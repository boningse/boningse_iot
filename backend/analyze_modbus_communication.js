/**
 * 分析电表Modbus通信协议实现
 * 展示电表地址16进制转换和完整的通信流程
 */

const { Device, ElectricMeter, ProtocolConfig } = require('./models');
const logger = require('./utils/logger');

/**
 * 分析电表地址和协议配置
 */
async function analyzeModbusCommunication() {
  try {
    console.log('=== 电表Modbus通信协议分析 ===\n');
    
    // 查询测试DTU设备及其电表
    const device = await Device.findOne({
      where: { name: '测试dtu' },
      include: [{
        model: ElectricMeter,
        as: 'electric_meters',
        where: { status: 'active' },
        required: false,
        include: [{
          model: ProtocolConfig,
          as: 'protocol_config'
        }]
      }]
    });

    if (!device || !device.electric_meters || device.electric_meters.length === 0) {
      console.log('❌ 未找到测试DTU设备或电表');
      return;
    }

    const electricMeter = device.electric_meters[0];
    const protocolConfig = electricMeter.protocol_config;
    const modbusConfig = protocolConfig.modbus_config;

    console.log('📱 设备信息:');
    console.log(`  - 设备名称: ${device.name}`);
    console.log(`  - 设备IMEI: ${device.imei}`);
    console.log(`  - 厂商代码: ${device.manufacturer_code}`);
    console.log(`  - 设备ID: ${device.id}`);
    console.log();

    console.log('⚡ 电表地址分析:');
    const meterAddress = electricMeter.meter_address;
    const decimalAddress = parseInt(meterAddress);
    const hexAddress = '0x' + decimalAddress.toString(16).toUpperCase().padStart(2, '0');
    
    console.log(`  - 原始地址: ${meterAddress}`);
    console.log(`  - 十进制地址: ${decimalAddress}`);
    console.log(`  - 十六进制地址: ${hexAddress}`);
    console.log(`  - 二进制地址: 0b${decimalAddress.toString(2).padStart(8, '0')}`);
    console.log();

    console.log('📋 协议配置分析:');
    console.log(`  - 协议名称: ${protocolConfig.name}`);
    console.log(`  - 协议版本: ${protocolConfig.version}`);
    console.log(`  - 设备类型: ${protocolConfig.device_type}`);
    console.log(`  - 厂商代码: ${protocolConfig.manufacturer_code}`);
    console.log();

    console.log('🔧 Modbus配置详情:');
    console.log(`  - 波特率: ${modbusConfig.baud_rate || '9600'}`);
    console.log(`  - 数据位: ${modbusConfig.data_bits || '8'}`);
    console.log(`  - 停止位: ${modbusConfig.stop_bits || '1'}`);
    console.log(`  - 校验位: ${modbusConfig.parity || 'none'}`);
    console.log(`  - 最大重试次数: ${modbusConfig.max_retries || '3'}`);
    console.log(`  - 发布间隔: ${modbusConfig.publish_interval || '5000'}ms`);
    console.log();

    console.log('📤 Modbus查询命令构造:');
    if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
      protocolConfig.modbus_registers.forEach((register, index) => {
        console.log(`  查询${index + 1}:`);
        console.log(`    - 功能码: ${register.function_code} (${getFunctionCodeDescription(register.function_code)})`);
        console.log(`    - 起始地址: ${register.address} (0x${register.address.toString(16).toUpperCase().padStart(4, '0')})`);
        console.log(`    - 数量: ${register.count || 1}`);
        console.log(`    - 数据类型: ${register.data_type}`);
        console.log(`    - 名称: ${register.name}`);
        console.log(`    - 单位: ${register.unit || 'N/A'}`);
        console.log();
      });
    }

    console.log('📊 寄存器映射分析:');
    if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
      protocolConfig.modbus_registers.forEach((register) => {
        const hexAddr = '0x' + register.address.toString(16).toUpperCase().padStart(4, '0');
        console.log(`  ${register.name}:`);
        console.log(`    - 地址: ${register.address} (${hexAddr})`);
        console.log(`    - 数据类型: ${register.data_type}`);
        console.log(`    - 缩放因子: ${register.scale || 1}`);
        console.log(`    - 单位: ${register.unit || 'N/A'}`);
        console.log(`    - 数量: ${register.count || 1} 寄存器`);
        console.log(`    - 功能码: ${register.function_code}`);
        console.log();
      });
    }

    console.log('🔄 完整的Modbus通信流程:');
    console.log('1. 系统构造Modbus查询命令:');
    const command = buildModbusCommand(electricMeter, protocolConfig);
    console.log(JSON.stringify(command, null, 2));
    console.log();

    console.log('2. 通过MQTT发布命令:');
    const commandTopic = buildCommandTopic(device);
    console.log(`   主题: ${commandTopic}`);
    console.log(`   QoS: 1`);
    console.log(`   消息体: 上述JSON命令`);
    console.log();

    console.log('3. 设备接收命令并执行Modbus查询:');
    console.log(`   - 设备地址: ${hexAddress}`);
    console.log(`   - 执行查询操作`);
    console.log(`   - 读取寄存器数据`);
    console.log();

    console.log('4. 设备返回数据格式:');
    const expectedResponse = {
      type: 'modbus_response',
      meter_id: electricMeter.id,
      meter_address: decimalAddress,
      meter_number: electricMeter.meter_number,
      timestamp: new Date().toISOString(),
      register_data: {},
      coil_data: {}
    };
    
    // 添加寄存器数据示例
    if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
      protocolConfig.modbus_registers.forEach((register) => {
        expectedResponse.register_data[register.address] = `<${register.name}_raw_value>`;
      });
    }
    
    console.log(JSON.stringify(expectedResponse, null, 2));
    console.log();

    console.log('5. 数据解析和处理:');
    console.log('   - 根据寄存器映射解析原始数据');
    console.log('   - 应用缩放因子');
    console.log('   - 保存到数据库');
    console.log('   - 通过WebSocket推送实时数据');
    console.log();

    console.log('📈 数据解析示例:');
    if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
      protocolConfig.modbus_registers.forEach((register) => {
        const rawValue = getExampleRawValue(register.data_type);
        const scaledValue = rawValue * (register.scale || 1);
        console.log(`  ${register.name}:`);
        console.log(`    原始值: ${rawValue}`);
        console.log(`    缩放后: ${scaledValue} ${register.unit || ''}`);
        console.log();
      });
    }

  } catch (error) {
    console.error('❌ 分析失败:', error.message);
  }
}

/**
 * 构建Modbus查询命令
 */
function buildModbusCommand(electricMeter, protocolConfig) {
  const command = {
    type: 'modbus_query',
    meter_address: parseInt(electricMeter.meter_address),
    meter_id: electricMeter.id,
    meter_number: electricMeter.meter_number,
    timestamp: new Date().toISOString(),
    queries: []
  };

  // 根据协议配置构造查询
  if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
    for (const register of protocolConfig.modbus_registers) {
      command.queries.push({
        function_code: register.function_code,
        start_address: register.address,
        quantity: register.count || 1,
        data_type: register.data_type || 'uint16'
      });
    }
  }

  return command;
}

/**
 * 构造设备命令主题
 */
function buildCommandTopic(device) {
  const mqttConfig = device.mqtt_config || {};
  
  // 优先使用command_topic字段
  if (mqttConfig.command_topic) {
    return mqttConfig.command_topic;
  }
  
  // 从subscribe_topics数组中查找命令主题
  if (mqttConfig.subscribe_topics && Array.isArray(mqttConfig.subscribe_topics)) {
    const commandTopic = mqttConfig.subscribe_topics.find(topic => 
      topic.description && topic.description.includes('命令') ||
      topic.description && topic.description.includes('command') ||
      topic.topic && topic.topic.includes('subscribe')
    );
    
    if (commandTopic) {
      return commandTopic.topic;
    }
  }
  
  // 默认命令主题格式
  const manufacturerCode = device.manufacturer_code || 'BNDK';
  return `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
}

/**
 * 获取功能码描述
 */
function getFunctionCodeDescription(functionCode) {
  const descriptions = {
    1: '读取线圈状态',
    2: '读取离散输入状态',
    3: '读取保持寄存器',
    4: '读取输入寄存器',
    5: '写单个线圈',
    6: '写单个寄存器',
    15: '写多个线圈',
    16: '写多个寄存器'
  };
  return descriptions[functionCode] || '未知功能码';
}

/**
 * 获取示例原始值
 */
function getExampleRawValue(dataType) {
  const examples = {
    'uint16': 2200,
    'int16': -150,
    'uint32': 123456,
    'int32': -123456,
    'float': 220.5,
    'boolean': true
  };
  return examples[dataType] || 1000;
}

// 执行分析
analyzeModbusCommunication().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});