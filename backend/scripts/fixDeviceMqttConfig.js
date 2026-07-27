const { Device, Manufacturer } = require('../models');
const logger = require('../utils/logger');

/**
 * 修复设备的MQTT配置
 * 将错误的简化格式转换为正确的数组格式
 */
async function fixDeviceMqttConfig() {
  try {
    console.log('开始修复设备MQTT配置...');
    
    // 查找所有使用错误格式的设备
    const devicesWithWrongConfig = await Device.findAll({
      where: {
        mqtt_config: {
          publishTopic: { [require('sequelize').Op.ne]: null }
        }
      }
    });
    
    console.log(`找到 ${devicesWithWrongConfig.length} 个需要修复的设备`);
    
    for (const device of devicesWithWrongConfig) {
      const { device_id, imei, manufacturer_code, mqtt_config } = device;
      
      console.log(`正在修复设备: ${device_id}`);
      
      // 默认使用imei_middle格式（BNDK厂商的标准格式）
      const subscriptionType = 'imei_middle';
      const manufacturerCode = manufacturer_code || 'UNKNOWN';
      const deviceImei = imei || device_id;
      
      // 构建正确的配置
      const subscribeTopics = [];
      const publishTopics = [];
      
      if (subscriptionType === 'imei_middle') {
        // IMEI在中间：zhhl/{厂商编号}/{IMEI}/subscribe
        subscribeTopics.push({
          topic: `zhhl/${manufacturerCode}/${deviceImei}/subscribe`,
          qos: 1,
          description: '接收命令(IMEI在中间格式)'
        });
        publishTopics.push({
          topic: `zhhl/${manufacturerCode}/${deviceImei}/publish`,
          qos: 1,
          description: '发送数据(IMEI在中间格式)',
          data_type: 'sensor_data'
        });
      } else if (subscriptionType === 'imei_last') {
        // IMEI在最后：zhhl/{厂商编号}/subscribe/{IMEI}
        subscribeTopics.push({
          topic: `zhhl/${manufacturerCode}/subscribe/${deviceImei}`,
          qos: 1,
          description: '接收命令(IMEI在最后格式)'
        });
        publishTopics.push({
          topic: `zhhl/${manufacturerCode}/publish/${deviceImei}`,
          qos: 1,
          description: '发送数据(IMEI在最后格式)',
          data_type: 'sensor_data'
        });
      } else {
        // 兼容旧格式或无厂商信息的设备
        subscribeTopics.push({
          topic: `device/${device_id}/command`,
          qos: 1,
          description: '接收命令(兼容格式)'
        });
        publishTopics.push({
          topic: `device/${device_id}/data`,
          qos: 1,
          description: '发送数据(兼容格式)',
          data_type: 'sensor_data'
        });
      }
      
      // 添加心跳主题
      publishTopics.push({
        topic: `device/${device_id}/heartbeat`,
        qos: 0,
        description: '心跳',
        data_type: 'heartbeat'
      });
      
      // 构建完整的配置
      const newMqttConfig = {
        enabled: true,
        auto_subscribe: true,
        subscribe_topics: subscribeTopics,
        publish_topics: publishTopics,
        heartbeat_interval: 60,
        offline_timeout: 300
      };
      
      // 更新设备配置
      await device.update({
        mqtt_config: newMqttConfig
      });
      
      console.log(`设备 ${device_id} 配置已修复`);
      console.log(`  订阅主题: ${subscribeTopics.map(t => t.topic).join(', ')}`);
      console.log(`  发布主题: ${publishTopics.map(t => t.topic).join(', ')}`);
    }
    
    console.log('所有设备MQTT配置修复完成!');
    
  } catch (error) {
    console.error('修复设备MQTT配置时出错:', error);
    logger.error('修复设备MQTT配置失败:', error);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  fixDeviceMqttConfig()
    .then(() => {
      console.log('脚本执行完成');
      process.exit(0);
    })
    .catch((error) => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { fixDeviceMqttConfig };