const { Device, DeviceData } = require('./models');
const { Op } = require('sequelize');

async function checkThermostatRawData() {
  try {
    console.log('=== 检查温控器原始数据结构 ===');
    
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
    
    // 查找最近的数据
    const recentData = await DeviceData.findAll({
      where: {
        device_id: device.id
      },
      order: [['received_at', 'DESC']],
      limit: 3
    });
    
    console.log(`找到 ${recentData.length} 条最近数据`);
    
    for (let i = 0; i < recentData.length; i++) {
      const data = recentData[i];
      console.log(`\n=== 数据 ${i + 1} ===`);
      console.log('时间:', data.received_at.toLocaleString());
      console.log('数据类型:', data.data_type);
      console.log('原始payload类型:', typeof data.payload);
      
      // 打印原始payload
      console.log('原始payload:', JSON.stringify(data.payload, null, 2));
      
      // 尝试解析payload
      let payload;
      try {
        payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
        console.log('解析后的payload结构:');
        console.log('- func:', payload.func);
        console.log('- pType:', payload.pType);
        console.log('- body:', payload.body ? 'exists' : 'null');
        
        if (payload.body) {
          console.log('- body.items:', payload.body.items);
          console.log('- body.data:', payload.body.data);
          
          // 如果有items和data，尝试解析状态
          if (payload.body.items && payload.body.data) {
            console.log('\n解析设备状态:');
            const items = payload.body.items;
            const dataArray = payload.body.data;
            
            for (let j = 0; j < items.length && j < dataArray.length; j++) {
              const item = items[j];
              const value = dataArray[j];
              console.log(`${item}: ${value}`);
              
              // 特别关注开关状态
              if (item === 'runOn' || item === 'setOn') {
                console.log(`*** 开关状态 ${item}: ${value} ***`);
              }
            }
          }
        }
        
        // 直接检查常见字段
        console.log('\n直接字段检查:');
        console.log('- runOn:', payload.runOn);
        console.log('- setOn:', payload.setOn);
        console.log('- power_status:', payload.power_status);
        console.log('- is_on:', payload.is_on);
        
      } catch (parseError) {
        console.log('解析payload失败:', parseError.message);
      }
    }
    
  } catch (error) {
    console.error('检查数据时发生错误:', error);
  }
}

// 运行检查
checkThermostatRawData().then(() => {
  console.log('\n检查完成');
  process.exit(0);
}).catch(error => {
  console.error('检查失败:', error);
  process.exit(1);
});