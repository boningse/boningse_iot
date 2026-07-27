const { Device, DeviceData } = require('./models');
const logger = require('./utils/logger');
const WebSocket = require('ws');

/**
 * 监控温控器响应数据
 * 实时监控温控器设备的响应数据，特别是设置风速、模式后的响应
 */
async function monitorThermostatResponses() {
  try {
    console.log('开始监控温控器响应数据...');
    
    // 获取温控器设备
    const devices = await Device.findAll({
      where: {
        manufacturer_code: 'BNWKQ' // 温控器厂商代码
      },
      include: ['protocol_config']
    });

    console.log(`找到 ${devices.length} 个温控器设备`);
    devices.forEach(device => {
      console.log(`- ${device.name} (${device.imei})`);
    });

    // 监控最近的设备数据
    console.log('\n开始监控最近的设备数据变化...');
    
    let lastCheckTime = new Date();
    
    setInterval(async () => {
      try {
        // 查询最近的设备数据
        const recentData = await DeviceData.findAll({
          where: {
            device_id: devices.map(d => d.id),
            received_at: {
              [require('sequelize').Op.gte]: lastCheckTime
            }
          },
          include: [{
            model: Device,
            as: 'device',
            attributes: ['id', 'name', 'imei']
          }],
          order: [['received_at', 'DESC']],
          limit: 10
        });

        if (recentData.length > 0) {
          console.log(`\n[${new Date().toISOString()}] 发现 ${recentData.length} 条新数据:`);
          
          recentData.forEach(data => {
            console.log(`\n设备: ${data.device.name} (${data.device.imei})`);
            console.log(`时间: ${data.received_at}`);
            console.log(`数据类型: ${data.data_type}`);
            console.log(`负载:`, JSON.stringify(data.payload, null, 2));
            
            // 检查关键字段
            if (data.payload) {
              const payload = data.payload;
              console.log('\n关键字段检查:');
              
              if (payload.runOn !== undefined) {
                console.log(`runOn (运行状态): ${payload.runOn} ${payload.runOn === 17 ? '(开机)' : payload.runOn === 16 ? '(待机)' : '(未知)'}`);
              }
              
              if (payload.setOn !== undefined) {
                console.log(`setOn (设置状态): ${payload.setOn} ${payload.setOn === 1 ? '(开机)' : '(关机)'}`);
              }
              
              if (payload.runFanSpeed !== undefined) {
                const fanSpeedMap = { 0: '自动', 1: '低风', 2: '中风', 3: '高风' };
                console.log(`runFanSpeed (运行风速): ${payload.runFanSpeed} (${fanSpeedMap[payload.runFanSpeed] || '未知'})`);
              }
              
              if (payload.setFanSpeed !== undefined) {
                const fanSpeedMap = { 0: '自动', 1: '低风', 2: '中风', 3: '高风' };
                console.log(`setFanSpeed (设置风速): ${payload.setFanSpeed} (${fanSpeedMap[payload.setFanSpeed] || '未知'})`);
              }
              
              if (payload.runMode !== undefined) {
                const modeMap = { 0: '送风', 1: '制热', 2: '制冷', 3: '除湿', 4: '自动' };
                console.log(`runMode (运行模式): ${payload.runMode} (${modeMap[payload.runMode] || '未知'})`);
              }
              
              if (payload.setMode !== undefined) {
                const modeMap = { 0: '送风', 1: '制热', 2: '制冷', 3: '除湿', 4: '自动' };
                console.log(`setMode (设置模式): ${payload.setMode} (${modeMap[payload.setMode] || '未知'})`);
              }
              
              if (payload.runTemp !== undefined) {
                console.log(`runTemp (运行温度): ${payload.runTemp / 10}°C`);
              }
              
              if (payload.setTemp !== undefined) {
                console.log(`setTemp (设置温度): ${payload.setTemp / 10}°C`);
              }
              
              if (payload.roomTemp !== undefined) {
                console.log(`roomTemp (室内温度): ${payload.roomTemp / 10}°C`);
              }
            }
            
            console.log('\n' + '='.repeat(80));
          });
        }
        
        lastCheckTime = new Date();
        
      } catch (error) {
        console.error('监控过程中出错:', error);
      }
    }, 5000); // 每5秒检查一次

    console.log('\n监控已启动，每5秒检查一次新数据...');
    console.log('按 Ctrl+C 停止监控');
    
  } catch (error) {
    console.error('启动监控失败:', error);
  }
}

// 优雅退出
process.on('SIGINT', () => {
  console.log('\n停止监控...');
  process.exit(0);
});

// 运行监控
if (require.main === module) {
  monitorThermostatResponses().catch(error => {
    console.error('监控失败:', error);
    process.exit(1);
  });
}

module.exports = { monitorThermostatResponses };