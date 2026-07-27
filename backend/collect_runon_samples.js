const { Device, DeviceData } = require('./models');
const { Op } = require('sequelize');

async function collectRunOnSamples() {
  try {
    console.log('=== 收集runOn字段数据样本 ===');
    
    // 查找温控器设备
    const thermostatDevices = await Device.findAll({
      where: {
        device_type_id: '2feb7eaf-3b5a-40c2-91c9-1538c1357b73'
      }
    });
    
    if (thermostatDevices.length === 0) {
      console.log('未找到温控器设备');
      return;
    }
    
    console.log(`找到 ${thermostatDevices.length} 个温控器设备`);
    
    const runOnValues = new Map();
    const setOnValues = new Map();
    const combinedStates = new Map();
    
    for (const device of thermostatDevices) {
      console.log(`\n=== 设备: ${device.imei} ===`);
      
      // 查找最近50条包含runOn字段的数据
      const recentData = await DeviceData.findAll({
        where: {
          device_id: device.id
        },
        order: [['created_at', 'DESC']],
        limit: 50
      });
      
      console.log(`找到 ${recentData.length} 条数据`);
      
      for (const data of recentData) {
        const payload = data.payload;
        
        // 检查是否包含items和data数组
        if (payload.body && payload.body.items && payload.body.data) {
          const items = payload.body.items;
          const dataValues = payload.body.data[0] || [];
          
          const runOnIndex = items.indexOf('runOn');
          const setOnIndex = items.indexOf('setOn');
          
          if (runOnIndex !== -1 && dataValues[runOnIndex] !== undefined) {
            const runOnValue = dataValues[runOnIndex];
            const setOnValue = setOnIndex !== -1 ? dataValues[setOnIndex] : 'N/A';
            
            // 统计runOn值
            if (!runOnValues.has(runOnValue)) {
              runOnValues.set(runOnValue, 0);
            }
            runOnValues.set(runOnValue, runOnValues.get(runOnValue) + 1);
            
            // 统计setOn值
            if (setOnValue !== 'N/A') {
              if (!setOnValues.has(setOnValue)) {
                setOnValues.set(setOnValue, 0);
              }
              setOnValues.set(setOnValue, setOnValues.get(setOnValue) + 1);
            }
            
            // 统计组合状态
            const combinedKey = `runOn:${runOnValue},setOn:${setOnValue}`;
            if (!combinedStates.has(combinedKey)) {
              combinedStates.set(combinedKey, {
                count: 0,
                timestamps: []
              });
            }
            const combined = combinedStates.get(combinedKey);
            combined.count++;
            combined.timestamps.push(data.created_at.toISOString());
            
            // 显示前10个样本的详细信息
            if (combinedStates.get(combinedKey).count <= 3) {
              console.log(`  样本: runOn=${runOnValue}, setOn=${setOnValue}, 时间=${data.created_at.toISOString()}`);
            }
          }
        }
      }
    }
    
    console.log('\n=== runOn值统计 ===');
    const sortedRunOn = Array.from(runOnValues.entries()).sort((a, b) => b[1] - a[1]);
    for (const [value, count] of sortedRunOn) {
      console.log(`runOn = ${value}: ${count} 次`);
    }
    
    console.log('\n=== setOn值统计 ===');
    const sortedSetOn = Array.from(setOnValues.entries()).sort((a, b) => b[1] - a[1]);
    for (const [value, count] of sortedSetOn) {
      console.log(`setOn = ${value}: ${count} 次`);
    }
    
    console.log('\n=== 组合状态统计 ===');
    const sortedCombined = Array.from(combinedStates.entries()).sort((a, b) => b[1].count - a[1].count);
    for (const [key, data] of sortedCombined) {
      console.log(`${key}: ${data.count} 次`);
      if (data.count <= 5) {
        console.log(`  时间样本: ${data.timestamps.slice(0, 3).join(', ')}`);
      }
    }
    
    // 分析状态模式
    console.log('\n=== 状态分析 ===');
    console.log('根据协议配置:');
    console.log('  待机状态: runOn = 16 或 0');
    console.log('  运行状态: runOn = 17 或 1');
    
    console.log('\n实际数据分析:');
    for (const [key, data] of sortedCombined) {
      const match = key.match(/runOn:(\d+),setOn:(\d+|N\/A)/);
      if (match) {
        const runOn = parseInt(match[1]);
        const setOn = match[2] === 'N/A' ? 'N/A' : parseInt(match[2]);
        
        let status = '未知';
        if (runOn === 16 || runOn === 0) {
          status = '待机';
        } else if (runOn === 17 || runOn === 1) {
          status = '运行';
        }
        
        console.log(`  ${key} -> ${status} (${data.count}次)`);
      }
    }
    
  } catch (error) {
    console.error('收集数据失败:', error);
  }
}

collectRunOnSamples().then(() => {
  console.log('\n数据收集完成');
  process.exit(0);
}).catch(error => {
  console.error('收集出错:', error);
  process.exit(1);
});