const { Device } = require('../models');
const logger = require('../utils/logger');

async function cleanMqttConfig() {
  try {
    console.log('开始清理设备MQTT配置...');
    
    // 获取所有有mqtt_config的设备
    const devices = await Device.findAll({
      where: {
        mqtt_config: {
          [require('sequelize').Op.ne]: null
        }
      }
    });
    
    console.log(`找到 ${devices.length} 个设备需要检查`);
    
    let cleanedCount = 0;
    
    for (const device of devices) {
      const mqttConfig = device.mqtt_config || {};
      
      // 需要移除的字段
      const fieldsToRemove = [
        'device_id', 'device_name', 'device_type', 'manufacturer_code', 
        'subscription_type', 'subscriptionType', 'publishTopic', 
        'subscribeTopic', 'publish_topic', 'subscribe_topic'
      ];
      
      let needsUpdate = false;
      const cleanedConfig = { ...mqttConfig };
      
      // 检查是否有需要移除的字段
      for (const field of fieldsToRemove) {
        if (cleanedConfig.hasOwnProperty(field)) {
          delete cleanedConfig[field];
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await device.update({ mqtt_config: cleanedConfig });
        cleanedCount++;
        console.log(`已清理设备 ${device.device_id} 的MQTT配置`);
      }
    }
    
    console.log(`清理完成！共清理了 ${cleanedCount} 个设备的配置`);
    
  } catch (error) {
    console.error('清理MQTT配置失败:', error);
    logger.error('清理MQTT配置失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  cleanMqttConfig().then(() => {
    console.log('脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = cleanMqttConfig;