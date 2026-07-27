const { Device, Manufacturer } = require('../models');
const mqttConfigService = require('../services/mqttConfigService');
const logger = require('../utils/logger');

async function fixSpecificDevice() {
  try {
    console.log('开始修复特定设备的MQTT配置...');
    
    // 获取特定设备
    const device = await Device.findOne({
      where: { device_id: '869080075378986' },
      include: [{
        model: Manufacturer,
        as: 'manufacturer',
        attributes: ['id', 'name', 'code', 'subscription_type']
      }]
    });
    
    if (!device) {
      console.log('设备不存在');
      return;
    }
    
    console.log(`找到设备: ${device.device_id}`);
    console.log(`厂商信息:`, device.manufacturer ? {
      code: device.manufacturer.code,
      subscription_type: device.manufacturer.subscription_type
    } : '无厂商信息');
    
    // 生成正确的MQTT配置
    const newConfig = mqttConfigService.buildDeviceConfig(device);
    
    console.log('生成的新配置:', JSON.stringify(newConfig, null, 2));
    
    // 更新设备配置
    await device.update({ mqtt_config: newConfig });
    
    console.log(`设备 ${device.device_id} 的MQTT配置已修复`);
    
  } catch (error) {
    console.error('修复设备MQTT配置失败:', error);
    logger.error('修复设备MQTT配置失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixSpecificDevice().then(() => {
    console.log('脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = fixSpecificDevice;