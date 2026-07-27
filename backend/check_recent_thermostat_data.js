const { Device, DeviceData } = require('./models');
const { Op } = require('sequelize');

async function checkRecentThermostatData() {
  try {
    console.log('=== 检查最近的温控器数据 ===');
    
    // 查找温控器设备
    const devices = await Device.findAll({
      where: {
        device_type_id: '2feb7eaf-3b5a-40c2-91c9-1538c1357b73' // 空调温控器类型UUID
      }
    });
    
    console.log(`找到 ${devices.length} 个温控器设备`);
    
    for (const device of devices) {
      console.log(`\n--- ${device.name} (${device.imei}) ---`);
      
      // 查找最近5分钟的数据
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      
      const recentData = await DeviceData.findAll({
        where: {
          device_id: device.id,
          received_at: {
            [Op.gte]: fiveMinutesAgo
          }
        },
        order: [['received_at', 'DESC']],
        limit: 5
      });
      
      console.log(`最近5分钟内有 ${recentData.length} 条数据`);
      
      if (recentData.length > 0) {
        console.log('\n最新数据:');
        for (const data of recentData) {
          const payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
          console.log(`时间: ${data.received_at.toLocaleString()}`);
          console.log(`数据:`, {
            runOn: payload.runOn,
            setOn: payload.setOn,
            runFanSpeed: payload.runFanSpeed,
            setFanSpeed: payload.setFanSpeed,
            runMode: payload.runMode,
            setMode: payload.setMode,
            runTemp: payload.runTemp,
            setTemp: payload.setTemp,
            roomTemp: payload.roomTemp
          });
          console.log('---');
        }
      } else {
        console.log('最近5分钟内没有数据');
        
        // 查找最新的一条数据
        const latestData = await DeviceData.findOne({
          where: {
            device_id: device.id
          },
          order: [['received_at', 'DESC']]
        });
        
        if (latestData) {
          console.log(`\n最新数据时间: ${latestData.received_at.toLocaleString()}`);
          const payload = typeof latestData.payload === 'string' ? JSON.parse(latestData.payload) : latestData.payload;
          console.log('最新数据:', {
            runOn: payload.runOn,
            setOn: payload.setOn,
            runFanSpeed: payload.runFanSpeed,
            setFanSpeed: payload.setFanSpeed,
            runMode: payload.runMode,
            setMode: payload.setMode,
            runTemp: payload.runTemp,
            setTemp: payload.setTemp,
            roomTemp: payload.roomTemp
          });
        } else {
          console.log('该设备没有任何数据');
        }
      }
    }
    
  } catch (error) {
    console.error('检查数据时发生错误:', error);
  }
}

// 运行检查
checkRecentThermostatData().then(() => {
  console.log('\n检查完成');
  process.exit(0);
}).catch(error => {
  console.error('检查失败:', error);
  process.exit(1);
});