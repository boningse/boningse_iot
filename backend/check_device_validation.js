const { Device, ProtocolConfig } = require('./models');

async function checkDeviceValidation() {
  try {
    const device = await Device.findByPk('62c37c27-5017-4c3d-b18b-d74d0bc80be1', {
      include: [{
        model: ProtocolConfig,
        as: 'protocol_config'
      }]
    });

    if (!device) {
      console.log('设备未找到');
      return;
    }

    console.log('=== 设备验证检查 ===');
    console.log('设备名称:', device.name);
    console.log('IP地址:', device.ip_address);
    console.log('连接配置:', device.connection_config);
    console.log('协议配置存在:', !!device.protocol_config);
    
    if (device.protocol_config) {
      console.log('\n=== 协议配置详情 ===');
      console.log('协议类型:', device.protocol_config.protocol_type);
      console.log('data_parsing_config.modbus:', device.protocol_config.data_parsing_config?.modbus);
      console.log('modbus_config存在:', !!device.protocol_config.modbus_config);
      
      if (device.protocol_config.modbus_config) {
        console.log('modbus_config内容:', JSON.stringify(device.protocol_config.modbus_config, null, 2));
      }
    }

    // 模拟验证逻辑
    console.log('\n=== 验证结果 ===');
    const hasIpOrHost = device.ip_address || device.connection_config?.host;
    console.log('IP地址或主机配置检查:', hasIpOrHost);
    
    const hasProtocolConfig = !!device.protocol_config;
    console.log('协议配置检查:', hasProtocolConfig);
    
    const hasModbusInDataParsing = !!device.protocol_config?.data_parsing_config?.modbus;
    console.log('data_parsing_config.modbus检查:', hasModbusInDataParsing);
    
    const hasModbusConfig = !!device.protocol_config?.modbus_config;
    console.log('modbus_config检查:', hasModbusConfig);
    
    console.log('\n当前验证逻辑通过:', hasIpOrHost && hasProtocolConfig && hasModbusInDataParsing);
    console.log('修正后验证逻辑通过:', hasIpOrHost && hasProtocolConfig && hasModbusConfig);

  } catch (error) {
    console.error('检查失败:', error);
  }
}

checkDeviceValidation();