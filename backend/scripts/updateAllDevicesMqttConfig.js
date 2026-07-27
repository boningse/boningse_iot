const { Device, Manufacturer } = require('../models');
const mqttConfigService = require('../services/mqttConfigService');
const logger = require('../utils/logger');

async function updateAllDevicesMqttConfig() {
  try {
    console.log('开始批量更新所有设备的MQTT配置...');
    
    // 获取所有设备
    const devices = await Device.findAll({
      include: [{
        model: Manufacturer,
        as: 'manufacturer',
        attributes: ['id', 'name', 'code', 'subscription_type']
      }]
    });
    
    if (!devices || devices.length === 0) {
      console.log('没有找到任何设备');
      return;
    }
    
    console.log(`找到 ${devices.length} 个设备，开始更新...`);
    
    let successCount = 0;
    let errorCount = 0;
    
    for (const device of devices) {
      try {
        console.log(`\n正在处理设备: ${device.device_id} (${device.name})`);
        
        if (!device.manufacturer) {
          console.log(`  警告: 设备 ${device.device_id} 没有关联的厂商信息，跳过`);
          errorCount++;
          continue;
        }
        
        console.log(`  厂商信息: ${device.manufacturer.code} (${device.manufacturer.subscription_type})`);
        
        // 生成新的简化MQTT配置
        const newConfig = mqttConfigService.buildDeviceConfig(device);
        
        console.log(`  生成的新配置:`);
        console.log(`    发布主题数量: ${newConfig.publish_topics ? newConfig.publish_topics.length : 0}`);
        console.log(`    订阅主题数量: ${newConfig.subscribe_topics ? newConfig.subscribe_topics.length : 0}`);
        
        // 更新设备配置
        await device.update({ mqtt_config: newConfig });
        
        console.log(`  ✓ 设备 ${device.device_id} 的MQTT配置已更新`);
        successCount++;
        
      } catch (error) {
        console.error(`  ✗ 更新设备 ${device.device_id} 失败:`, error.message);
        logger.error(`更新设备 ${device.device_id} MQTT配置失败:`, error);
        errorCount++;
      }
    }
    
    console.log(`\n批量更新完成:`);
    console.log(`  成功: ${successCount} 个设备`);
    console.log(`  失败: ${errorCount} 个设备`);
    console.log(`  总计: ${devices.length} 个设备`);
    
  } catch (error) {
    console.error('批量更新设备MQTT配置失败:', error);
    logger.error('批量更新设备MQTT配置失败:', error);
    throw error;
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  updateAllDevicesMqttConfig().then(() => {
    console.log('\n脚本执行完成');
    process.exit(0);
  }).catch(error => {
    console.error('\n脚本执行失败:', error);
    process.exit(1);
  });
}

module.exports = updateAllDevicesMqttConfig;