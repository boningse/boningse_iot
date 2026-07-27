const { Device, DeviceData } = require('./models');
const { Op } = require('sequelize');

async function findThermostatStatusData() {
  try {
    console.log('=== 查找温控器状态数据 ===');
    
    // 查找温控器设备
    const thermostatDevices = await Device.findAll({
      where: {
        device_type_id: '2feb7eaf-3b5a-40c2-91c9-1538c1357b73'
      },
      limit: 2
    });
    
    if (thermostatDevices.length === 0) {
      console.log('未找到温控器设备');
      return;
    }
    
    for (const device of thermostatDevices) {
      console.log(`\n=== 设备: ${device.imei} ===`);
      
      // 查找最近10条数据
      const recentData = await DeviceData.findAll({
        where: {
          device_id: device.id
        },
        order: [['created_at', 'DESC']],
        limit: 10
      });
      
      console.log(`找到 ${recentData.length} 条数据`);
      
      for (let i = 0; i < recentData.length; i++) {
        const data = recentData[i];
        const payload = data.payload;
        
        console.log(`\n--- 数据 ${i + 1} (${data.created_at}) ---`);
        console.log('func:', payload.func);
        console.log('pType:', payload.pType);
        
        // 检查是否包含items和data数组
        if (payload.body && payload.body.items && payload.body.data) {
          console.log('✅ 找到包含items和data的数据!');
          console.log('items:', payload.body.items);
          console.log('data:', payload.body.data);
          
          // 检查是否包含runFanSpeed
          const items = payload.body.items;
          if (items.includes('runFanSpeed')) {
            const runFanSpeedIndex = items.indexOf('runFanSpeed');
            const dataValues = payload.body.data[0];
            if (dataValues && dataValues[runFanSpeedIndex] !== undefined) {
              console.log(`runFanSpeed值: ${dataValues[runFanSpeedIndex]}`);
            }
          }
          
          // 显示完整的字段映射
          console.log('\n字段映射:');
          const dataValues = payload.body.data[0] || [];
          for (let j = 0; j < items.length && j < dataValues.length; j++) {
            console.log(`  ${items[j]}: ${dataValues[j]}`);
          }
          
          break; // 找到一个就够了
        } else {
          console.log('body结构:', Object.keys(payload.body || {}));
        }
      }
    }
    
  } catch (error) {
    console.error('查找失败:', error);
  }
}

findThermostatStatusData().then(() => {
  console.log('\n查找完成');
  process.exit(0);
}).catch(error => {
  console.error('查找出错:', error);
  process.exit(1);
});