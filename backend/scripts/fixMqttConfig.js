const { Device, Manufacturer } = require('../models');
const mqttConfigService = require('../services/mqttConfigService');
const logger = require('../utils/logger');

async function fixMqttConfig() {
  try {
    console.log('开始修复设备MQTT配置...');
    
    // 获取所有设备，包括厂商信息
    const devices = await Device.findAll({
      include: [{
        model: Manufacturer,
        as: 'manufacturer',
        attributes: ['id', 'name', 'code', 'subscription_type']
      }]
    });
    
    console.log(`找到 ${devices.length} 个设备需要检查`);
    
    let fixedCount = 0;
    
    for (const device of devices) {
      const mqttConfig = device.mqtt_config || {};
      
      // 检查是否需要重新生成配置
      // 1. 没有mqtt_config
      // 2. mqtt_config为空对象
      // 3. 只有简单的publishTopic/subscribeTopic而没有详细的topics数组
      const needsRegeneration = 
        !mqttConfig || 
        Object.keys(mqttConfig).length === 0 ||
        (!mqttConfig.subscribe_topics && !mqttConfig.publish_topics);
      
      if (needsRegeneration) {
        try {
          // 使用mqttConfigService重新生成完整配置
          const newConfig = mqttConfigService.buildDeviceConfig(device);
          
          // 更新设备配置
          await device.update({ mqtt_config: newConfig });
          
          fixedCount++;
          console.log(`已修复设备 ${device.device_id} 的MQTT配置`);
          
        } catch (error) {
          console.error(`修复设备 ${device.device_id} 配置失败:`, error.message);
        }
      }
    }
    
    console.log(`修复完成！共修复了 ${fixedCount} 个设备的配置`);
    
  } catch (error) {
    console.error('修复MQTT配置失败:', error);
    logger.error('修复MQTT配置失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixMqttConfig().then(() => {
    console.log('脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = fixMqttConfig;