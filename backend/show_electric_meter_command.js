/**
 * 展示电表下发的MQTT命令数据
 */

const { Device, ElectricMeter, ProtocolConfig } = require('./models');
const logger = require('./utils/logger');

/**
 * 模拟构建Modbus查询命令
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

  // 如果有线圈配置
  const modbusConfig = protocolConfig.modbus_config;
  if (modbusConfig && modbusConfig.coils && modbusConfig.coils.length > 0) {
    for (const coilConfig of modbusConfig.coils) {
      command.queries.push({
        function_code: 1, // 读取线圈
        start_address: coilConfig.address,
        quantity: 1,
        data_type: 'boolean'
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
  
  // 优先使用command_topic字段（向后兼容）
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

async function showElectricMeterCommand() {
  try {
    console.log('=== 电表MQTT命令数据展示 ===\n');
    
    // 查询测试DTU设备及其电表
    const device = await Device.findOne({
      where: { name: '测试dtu' },
      include: [
        {
          model: ElectricMeter,
          as: 'electric_meters',
          where: { status: 'active' },
          required: false
        },
        {
          model: ProtocolConfig,
          as: 'protocol_config'
        }
      ]
    });

    if (!device) {
      console.log('❌ 未找到测试DTU设备');
      return;
    }

    if (!device.electric_meters || device.electric_meters.length === 0) {
      console.log('❌ 设备没有配置电表');
      return;
    }

    console.log('📱 设备信息:');
    console.log(`  - 设备名称: ${device.name}`);
    console.log(`  - 设备IMEI: ${device.imei}`);
    console.log(`  - 厂商代码: ${device.manufacturer_code}`);
    console.log(`  - 设备ID: ${device.id}`);
    console.log();

    console.log('📡 MQTT配置:');
    const commandTopic = buildCommandTopic(device);
    console.log(`  - 命令发布主题: ${commandTopic}`);
    if (device.mqtt_config.publish_topics) {
      console.log('  - 数据接收主题:');
      device.mqtt_config.publish_topics.forEach(topic => {
        console.log(`    * ${topic.topic} (${topic.description})`);
      });
    }
    console.log();

    // 遍历每个电表
    for (const electricMeter of device.electric_meters) {
      console.log(`⚡ 电表信息:`);
      console.log(`  - 电表编号: ${electricMeter.meter_number}`);
      console.log(`  - 电表地址: ${electricMeter.meter_address}`);
      console.log(`  - 电表ID: ${electricMeter.id}`);
      console.log(`  - 状态: ${electricMeter.status}`);
      console.log();

      // 使用设备的协议配置，而不是电表的协议配置
      if (!device.protocol_config) {
        console.log('❌ 设备缺少协议配置');
        continue;
      }

      const modbusConfig = device.protocol_config.modbus_config;
      if (!modbusConfig) {
        console.log('❌ 设备缺少Modbus配置');
        continue;
      }

      // 构建命令
      const command = buildModbusCommand(electricMeter, device.protocol_config);
      
      console.log('📤 发布的查询命令:');
      console.log(`  - 主题: ${commandTopic}`);
      console.log(`  - QoS: 1`);
      console.log(`  - 命令内容:`);
      console.log(JSON.stringify(command, null, 4));
      console.log();

      // 显示寄存器映射
      if (modbusConfig.registers) {
        console.log('📊 寄存器映射:');
        Object.entries(modbusConfig.registers).forEach(([name, config]) => {
          console.log(`  - ${name}: 地址=${config.address}, 缩放=${config.scale}, 单位=${config.unit}`);
        });
        console.log();
      }

      // 显示期望的返回数据格式
      console.log('📥 期望的返回数据格式:');
      const expectedResponse = {
        type: 'modbus_response',
        meter_id: electricMeter.id,
        meter_address: parseInt(electricMeter.meter_address),
        meter_number: electricMeter.meter_number,
        timestamp: new Date().toISOString(),
        register_data: {},
        coil_data: {}
      };
      
      // 添加寄存器数据示例
      if (modbusConfig.registers) {
        Object.entries(modbusConfig.registers).forEach(([name, config]) => {
          expectedResponse.register_data[config.address] = `<${name}_value>`;
        });
      }
      
      console.log(JSON.stringify(expectedResponse, null, 4));
      console.log();
      console.log('='.repeat(80));
      console.log();
    }

  } catch (error) {
    console.error('❌ 查询失败:', error.message);
  }
}

// 执行查询
showElectricMeterCommand().then(() => {
  process.exit(0);
}).catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});