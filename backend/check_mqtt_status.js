const mqttService = require('./services/mqttService');
const logger = require('./utils/logger');

/**
 * 检查MQTT服务状态
 */
async function checkMqttStatus() {
  try {
    console.log('检查MQTT服务状态...');
    
    // 检查MQTT连接状态
    console.log('MQTT连接状态:', mqttService.isConnected);
    console.log('MQTT客户端状态:', mqttService.client ? mqttService.client.connected : 'client未初始化');
    
    // 如果未连接，尝试连接
    if (!mqttService.isConnected) {
      console.log('MQTT未连接，尝试连接...');
      await mqttService.connect();
      console.log('MQTT连接完成，状态:', mqttService.isConnected);
    }
    
    // 测试发送命令
    console.log('\n测试发送温控器命令...');
    
    const testCommand = {
      func: 'write',
      uuid: '869861065084704',
      pType: 'params',
      body: {
        setFanSpeed: 2,
        setOn: 1,
        id: 1
      }
    };
    
    console.log('发送测试命令:', JSON.stringify(testCommand, null, 2));
    
    const result = await mqttService.sendCommandToDevice('869861065084704', testCommand);
    console.log('命令发送结果:', result);
    
  } catch (error) {
    console.error('检查MQTT状态失败:', error);
  }
}

// 运行检查
if (require.main === module) {
  checkMqttStatus().then(() => {
    console.log('\nMQTT状态检查完成');
    process.exit(0);
  }).catch(error => {
    console.error('检查失败:', error);
    process.exit(1);
  });
}

module.exports = { checkMqttStatus };