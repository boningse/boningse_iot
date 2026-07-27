/**
 * 通过API触发RTU格式电表轮询脚本
 * 利用已运行的后端应用来启动RTU格式轮询
 */

const { Device, ElectricMeter, ProtocolConfig } = require('./models');
const logger = require('./utils/logger');

/**
 * 直接调用电表轮询服务
 */
async function triggerRtuPolling() {
  console.log('=== 触发RTU格式电表轮询 ===\n');
  
  try {
    // 1. 查找测试DTU设备及其电表配置
    const device = await Device.findOne({
      where: { imei: '865661074511729' },
      include: [{
        model: ElectricMeter,
        as: 'electric_meters',
        where: { status: 'active' },
        include: [{
          model: ProtocolConfig,
          as: 'protocol_config'
        }]
      }]
    });
    
    if (!device) {
      throw new Error('未找到测试DTU设备');
    }
    
    console.log(`找到设备: ${device.name} (ID: ${device.id})`);
    console.log(`设备IMEI: ${device.imei}`);
    console.log(`电表数量: ${device.electric_meters?.length || 0}\n`);
    
    if (!device.electric_meters || device.electric_meters.length === 0) {
      throw new Error('设备未配置电表');
    }
    
    // 2. 获取电表信息
    const electricMeter = device.electric_meters[0];
    console.log(`电表信息:`);
    console.log(`- 电表编号: ${electricMeter.meter_number}`);
    console.log(`- 电表地址: ${electricMeter.meter_address}`);
    console.log(`- 协议配置: ${electricMeter.protocol_config?.name}\n`);
    
    // 3. 获取全局电表MQTT服务实例（从主应用）
    const app = require('./app');
    const electricMeterService = app.get('electricMeterService');
    
    if (!electricMeterService) {
      throw new Error('电表MQTT服务未在主应用中初始化');
    }
    
    console.log('✅ 找到电表MQTT服务实例\n');
    
    // 4. 停止现有轮询（如果有）
    console.log('停止现有轮询...');
    electricMeterService.stopDevicePolling(`${device.id}`);
    
    // 5. 启动RTU格式轮询
    console.log('启动RTU格式电表轮询...');
    await electricMeterService.startDevicePolling(device, { useRtuFormat: true });
    
    console.log('✅ RTU格式电表轮询已启动\n');
    
    // 6. 构造并显示RTU命令示例
    const protocolConfig = electricMeter.protocol_config;
    const modbusConfig = protocolConfig.modbus_config;
    
    const rtuCommand = electricMeterService.buildModbusCommand(
      electricMeter, 
      modbusConfig, 
      { useRtuFormat: true }
    );
    
    console.log('RTU命令示例:');
    if (rtuCommand.rtu_commands && rtuCommand.rtu_commands.length > 0) {
      rtuCommand.rtu_commands.forEach((cmd, index) => {
        console.log(`指令 ${index + 1}: ${cmd.hex_command}`);
        console.log(`  - 功能码: ${cmd.function_code}`);
        console.log(`  - 地址: ${cmd.start_address}`);
        console.log(`  - 数量: ${cmd.quantity}`);
      });
    }
    console.log();
    
    console.log('轮询配置:');
    console.log('- 格式: RTU字节流');
    console.log('- 轮询间隔: 10分钟');
    console.log('- 目标设备: 测试DTU');
    console.log('- MQTT主题: zhhl/BNDBA/865661074511729/subscribe');
    console.log('- 从站地址: 1');
    console.log('- 寄存器地址: 31');
    console.log('- 数据类型: uint16\n');
    
    console.log('✅ RTU格式电表轮询配置完成!');
    console.log('\n说明:');
    console.log('- 电表轮询服务已在后台运行');
    console.log('- RTU格式指令将定期发送到设备');
    console.log('- 设备收到RTU指令后会解析并返回电表数据');
    console.log('- 可通过MQTT日志查看指令发送和数据接收情况');
    
  } catch (error) {
    console.error('❌ 触发失败:', error.message);
    console.error('错误详情:', error);
  }
}

// 运行脚本
if (require.main === module) {
  triggerRtuPolling()
    .then(() => {
      console.log('\n脚本执行完成');
      process.exit(0);
    })
    .catch(error => {
      console.error('脚本执行失败:', error);
      process.exit(1);
    });
}

module.exports = { triggerRtuPolling };