const { Device, DeviceData } = require('./models');
const { Op } = require('sequelize');

async function checkRawThermostatData() {
  try {
    console.log('=== 检查原始温控器数据 ===');
    
    // 查找温控器设备
    const devices = await Device.findAll({
      where: {
        device_type_id: '2feb7eaf-3b5a-40c2-91c9-1538c1357b73' // 空调温控器类型UUID
      }
    });
    
    console.log(`找到 ${devices.length} 个温控器设备`);
    
    for (const device of devices) {
      console.log(`\n--- ${device.name} (${device.imei}) ---`);
      
      // 查找最近的数据
      const recentData = await DeviceData.findAll({
        where: {
          device_id: device.id
        },
        order: [['received_at', 'DESC']],
        limit: 3
      });
      
      console.log(`最近有 ${recentData.length} 条数据`);
      
      if (recentData.length > 0) {
        console.log('\n原始数据:');
        for (let i = 0; i < recentData.length; i++) {
          const data = recentData[i];
          console.log(`\n数据 ${i + 1}:`);
          console.log(`时间: ${data.received_at.toLocaleString()}`);
          console.log(`数据类型: ${data.data_type}`);
          console.log(`原始payload类型: ${typeof data.payload}`);
          console.log(`原始payload长度: ${data.payload ? data.payload.length : 'null'}`);
          
          if (typeof data.payload === 'string') {
            console.log(`原始payload字符串: ${data.payload}`);
            try {
              const parsed = JSON.parse(data.payload);
              console.log('解析后的payload:', JSON.stringify(parsed, null, 2));
            } catch (e) {
              console.log('JSON解析失败:', e.message);
            }
          } else {
            console.log('原始payload对象:', JSON.stringify(data.payload, null, 2));
          }
          console.log('---');
        }
      } else {
        console.log('该设备没有任何数据');
      }
    }
    
  } catch (error) {
    console.error('检查数据时发生错误:', error);
  }
}

// 运行检查
checkRawThermostatData().then(() => {
  console.log('\n检查完成');
  process.exit(0);
}).catch(error => {
  console.error('检查失败:', error);
  process.exit(1);
});