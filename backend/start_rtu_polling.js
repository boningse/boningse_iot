/**
 * 启动RTU格式电表轮询脚本
 * 实际启动电表的RTU格式数据轮询
 */

const DevicePollingService = require('./services/devicePollingService');
const { Device } = require('./models');
const logger = require('./utils/logger');

/**
 * 启动RTU格式电表轮询
 */
async function startRtuPolling() {
  console.log('=== 启动RTU格式电表轮询 ===\n');
  
  try {
    // 1. 查找测试DTU设备
    const device = await Device.findOne({
      where: { imei: '865661074511729' }
    });
    
    if (!device) {
      throw new Error('未找到测试DTU设备');
    }
    
    console.log(`找到设备: ${device.name} (ID: ${device.id})`);
    console.log(`设备IMEI: ${device.imei}\n`);
    
    // 2. 创建电表MQTT服务实例
    const devicePollingService = new DevicePollingService();
    
    // 3. 初始化MQTT服务
    console.log('初始化MQTT服务...');
    await devicePollingService.initialize();
    console.log('✅ MQTT服务初始化完成\n');
    
    // 4. 启动RTU格式的设备轮询
    console.log('启动RTU格式电表轮询...');
    await devicePollingService.startDevicePolling(device, { useRtuFormat: true });
    console.log('✅ RTU格式电表轮询已启动\n');
    
    console.log('轮询配置:');
    console.log('- 格式: RTU字节流');
    console.log('- 轮询间隔: 10分钟');
    console.log('- 目标设备: 测试DTU');
    console.log('- MQTT主题: zhhl/BNDBA/865661074511729/subscribe\n');
    
    // 5. 等待一段时间观察轮询效果
    console.log('等待30秒观察轮询效果...');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    console.log('\n✅ RTU格式电表轮询启动完成!');
    console.log('\n说明:');
    console.log('- 电表轮询服务已在后台运行');
    console.log('- RTU格式指令将定期发送到设备');
    console.log('- 可通过日志查看指令发送情况');
    console.log('- 设备收到指令后会返回电表数据');
    
  } catch (error) {
    console.error('❌ 启动失败:', error.message);
    console.error('错误详情:', error);
  }
}

// 运行脚本
if (require.main === module) {
  startRtuPolling()
    .then(() => {
      console.log('\n脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { startRtuPolling };