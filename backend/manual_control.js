const mqttService = require('./services/mqttService');
const logger = require('./utils/logger');

// 手动控制照明设备的脚本
async function controlLightingDevice() {
  try {
    // 等待MQTT服务连接
    if (!mqttService.isConnected) {
      console.log('MQTT未连接，正在连接...');
      await mqttService.connect();
      // 等待连接建立
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // 设备IMEI列表
    const devices = [
      '869080075359739',
      '869080075361420', 
      '869080075361438'
    ];

    // 关灯控制指令
    const controlCommand = {
      type: 'event',
      key1: 0,
      key3: 0
    };

    console.log('开始发送关灯控制指令...');

    // 向每个设备发送关灯指令
    for (const deviceImei of devices) {
      try {
        console.log(`正在向设备 ${deviceImei} 发送关灯指令...`);
        await mqttService.sendCommandToDevice(deviceImei, controlCommand);
        console.log(`设备 ${deviceImei} 关灯指令发送成功`);
        
        // 等待一秒再发送下一个
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`设备 ${deviceImei} 控制失败:`, error.message);
      }
    }

    console.log('所有设备关灯指令发送完成');
    
  } catch (error) {
    console.error('控制照明设备失败:', error.message);
  }
}

// 执行控制
controlLightingDevice().then(() => {
  console.log('手动控制完成');
  process.exit(0);
}).catch(error => {
  console.error('执行失败:', error);
  process.exit(1);
});