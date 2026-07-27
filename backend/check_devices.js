const { Device, ElectricMeter, ProtocolConfig } = require('./models');

(async () => {
  try {
    console.log('=== 检查Modbus设备配置 ===');
    const devices = await Device.findAll({
      include: [{ model: ProtocolConfig, as: 'protocol_config' }],
      limit: 10
    });
    
    console.log('设备数量:', devices.length);
    devices.forEach(device => {
      console.log(`设备: ${device.name} (ID: ${device.id})`);
      console.log(`  协议配置: ${device.protocol_config ? device.protocol_config.name : '无'}`);
      console.log(`  设备类型: ${device.device_type}`);
      console.log(`  IP地址: ${device.ip_address}`);
      console.log('---');
    });
    
    console.log('\n=== 检查电表配置 ===');
    const meters = await ElectricMeter.findAll({
      include: [
        { model: Device, as: 'device' },
        { model: ProtocolConfig, as: 'protocol_config' }
      ],
      limit: 10
    });
    
    console.log('电表数量:', meters.length);
    meters.forEach(meter => {
      console.log(`电表: ${meter.name} (地址: ${meter.address})`);
      console.log(`  关联设备: ${meter.device ? meter.device.name : '无'}`);
      console.log(`  协议配置: ${meter.protocol_config ? meter.protocol_config.name : '无'}`);
      console.log(`  采集频率: ${meter.collection_interval || '未设置'}`);
      console.log('---');
    });
    
    process.exit(0);
  } catch (error) {
    console.error('查询失败:', error.message);
    process.exit(1);
  }
})();