const { Device } = require('../models');
const logger = require('../utils/logger');

async function finalCleanMqttConfig() {
  try {
    console.log('开始最终清理设备MQTT配置...');
    
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
      
      // 检查是否有旧格式的字段需要移除
      const hasOldFields = mqttConfig.hasOwnProperty('publishTopic') || 
                          mqttConfig.hasOwnProperty('subscribeTopic') ||
                          mqttConfig.hasOwnProperty('publish_topic') ||
                          mqttConfig.hasOwnProperty('subscribe_topic');
      
      if (hasOldFields) {
        const cleanedConfig = { ...mqttConfig };
        
        // 移除旧格式字段
        delete cleanedConfig.publishTopic;
        delete cleanedConfig.subscribeTopic;
        delete cleanedConfig.publish_topic;
        delete cleanedConfig.subscribe_topic;
        
        await device.update({ mqtt_config: cleanedConfig });
        cleanedCount++;
        console.log(`已清理设备 ${device.device_id} 的旧MQTT配置字段`);
      }
    }
    
    console.log(`最终清理完成！共清理了 ${cleanedCount} 个设备的配置`);
    
  } catch (error) {
    console.error('最终清理MQTT配置失败:', error);
    logger.error('最终清理MQTT配置失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  finalCleanMqttConfig().then(() => {
    console.log('脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = finalCleanMqttConfig;