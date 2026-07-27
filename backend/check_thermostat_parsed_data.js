const { Device, DeviceData } = require('./models');
const { Op } = require('sequelize');

async function checkThermostatParsedData() {
  try {
    console.log('=== 检查温控器解析后的数据 ===');
    
    // 查找202房间温控器设备
    const device = await Device.findOne({
      where: {
        name: '202房间温控器'
      }
    });
    
    if (!device) {
      console.log('未找到202房间温控器设备');
      return;
    }
    
    console.log(`找到设备: ${device.name} (${device.imei})`);
    
    // 查找最新的数据
    const latestData = await DeviceData.findOne({
      where: {
        device_id: device.id
      },
      order: [['received_at', 'DESC']]
    });
    
    if (!latestData) {
      console.log('没有找到任何数据');
      return;
    }
    
    console.log(`\n最新数据时间: ${latestData.received_at.toLocaleString()}`);
    
    // 解析数据
    const payload = typeof latestData.payload === 'string' ? JSON.parse(latestData.payload) : latestData.payload;
    
    if (payload.body && payload.body.items && payload.body.data && payload.body.data[0]) {
      const items = payload.body.items;
      const dataArray = payload.body.data[0]; // 取第一个数据数组
      
      console.log('\n=== 解析后的设备状态 ===');
      
      const deviceStatus = {};
      for (let i = 0; i < items.length && i < dataArray.length; i++) {
        const key = items[i];
        const value = dataArray[i];
        deviceStatus[key] = value;
        console.log(`${key}: ${value}`);
      }
      
      console.log('\n=== 关键状态信息 ===');
      
      // 应用新的runOn映射策略：16->0, 17->1
      let mappedRunOn = deviceStatus.runOn;
      if (deviceStatus.runOn === 16) {
        mappedRunOn = 0;
      } else if (deviceStatus.runOn === 17) {
        mappedRunOn = 1;
      }
      
      console.log(`开关状态 (runOn): ${deviceStatus.runOn} -> 映射后: ${mappedRunOn} ${mappedRunOn === 1 ? '(开启)' : '(关闭)'}`);
      console.log(`运行模式 (runMode): ${deviceStatus.runMode}`);
      console.log(`风速 (runFanSpeed): ${deviceStatus.runFanSpeed}`);
      console.log(`设定温度 (runTemp): ${deviceStatus.runTemp ? deviceStatus.runTemp / 10 : 'N/A'}°C`);
      console.log(`室内温度 (roomTemp): ${deviceStatus.roomTemp ? deviceStatus.roomTemp / 10 : 'N/A'}°C`);
      console.log(`错误代码 (error): ${deviceStatus.error}`);
      
      // 检查最近几条数据的变化
      console.log('\n=== 最近状态变化 ===');
      const recentData = await DeviceData.findAll({
        where: {
          device_id: device.id
        },
        order: [['received_at', 'DESC']],
        limit: 5
      });
      
      for (let i = 0; i < recentData.length; i++) {
        const data = recentData[i];
        const payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
        
        if (payload.body && payload.body.items && payload.body.data && payload.body.data[0]) {
          const items = payload.body.items;
          const dataArray = payload.body.data[0];
          
          const runOnIndex = items.indexOf('runOn');
          const runOn = runOnIndex >= 0 ? dataArray[runOnIndex] : null;
          
          // 应用新的runOn映射策略：16->0, 17->1
          let mappedRunOn = runOn;
          if (runOn === 16) {
            mappedRunOn = 0;
          } else if (runOn === 17) {
            mappedRunOn = 1;
          }
          
          console.log(`${data.received_at.toLocaleString()}: runOn = ${runOn} -> 映射后: ${mappedRunOn} ${mappedRunOn === 1 ? '(开启)' : '(关闭)'}`);
        }
      }
      
    } else {
      console.log('数据格式不正确，无法解析');
      console.log('payload结构:', JSON.stringify(payload, null, 2));
    }
    
  } catch (error) {
    console.error('检查数据时发生错误:', error);
  }
}

// 运行检查
checkThermostatParsedData().then(() => {
  console.log('\n检查完成');
  process.exit(0);
}).catch(error => {
  console.error('检查失败:', error);
  process.exit(1);
});