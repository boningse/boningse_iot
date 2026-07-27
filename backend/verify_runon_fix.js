const { Pool } = require('pg');

// 数据库连接配置
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'iot_device_management',
  password: '123456',
  port: 5432,
});

async function verifyRunOnFix() {
  console.log('=== runOn字段修复验证 ===\n');
  
  try {
    // 查询设备ID
    const deviceQuery = await pool.query(
      "SELECT id FROM devices WHERE imei = '869861065084704'"
    );
    
    if (deviceQuery.rows.length === 0) {
      console.log('❌ 未找到测试设备');
      return;
    }
    
    const deviceId = deviceQuery.rows[0].id;
    console.log(`✅ 找到测试设备: ${deviceId}\n`);
    
    // 查询最新的设备数据
    const dataQuery = await pool.query(`
      SELECT payload, created_at 
      FROM device_data 
      WHERE device_id = $1 
        AND payload->'body'->>'func' = 'report'
      ORDER BY created_at DESC 
      LIMIT 5
    `, [deviceId]);
    
    // 过滤包含runOn的记录
    const runOnData = dataQuery.rows.filter(row => {
      const payload = row.payload;
      return payload.body.items && payload.body.items.includes('runOn');
    });
    
    console.log('📊 最新的runOn数据记录:');
    if (runOnData.length === 0) {
      console.log('   未找到包含runOn字段的数据记录');
      console.log('   显示最新的report数据:');
      dataQuery.rows.slice(0, 3).forEach((row, index) => {
        console.log(`${index + 1}. 时间: ${row.created_at}`);
        console.log(`   payload: ${JSON.stringify(row.payload, null, 2)}`);
      });
    } else {
      runOnData.forEach((row, index) => {
        const payload = row.payload;
        const items = payload.body.items;
        const data = payload.body.data[0];
        const runOnIndex = items.indexOf('runOn');
        const runOnValue = data[runOnIndex];
        
        console.log(`${index + 1}. 时间: ${row.created_at}`);
        
        // 应用新的runOn映射策略：16->0, 17->1
        let mappedRunOn = runOnValue;
        if (runOnValue === 16) {
          mappedRunOn = 0;
        } else if (runOnValue === 17) {
          mappedRunOn = 1;
        }
        
        console.log(`   runOn值: ${runOnValue} -> 映射后: ${mappedRunOn} (${mappedRunOn === 1 ? '运行中' : '待机中'})`);
      });
    }
    
    // 查询对应的thermostat_properties记录
    const propQuery = await pool.query(`
      SELECT power_status, current_temperature, target_temp, ac_mode, updated_at
      FROM thermostat_properties 
      WHERE device_id = $1 
      ORDER BY updated_at DESC 
      LIMIT 3
    `, [deviceId]);
    
    console.log('\n🏠 对应的温控器属性记录:');
    propQuery.rows.forEach((row, index) => {
      console.log(`${index + 1}. 时间: ${row.updated_at}`);
      console.log(`   电源状态: ${row.power_status ? '开启' : '关闭'}`);
      console.log(`   当前温度: ${row.current_temperature}°C`);
      console.log(`   目标温度: ${row.target_temp}°C`);
      console.log(`   运行模式: ${row.ac_mode}`);
    });
    
    // 验证逻辑
    if (runOnData.length > 0 && propQuery.rows.length > 0) {
      const latestData = runOnData[0];
      const latestProp = propQuery.rows[0];
      
      const payload = latestData.payload;
      const items = payload.body.items;
      const data = payload.body.data[0];
      const runOnIndex = items.indexOf('runOn');
      const runOnValue = data[runOnIndex];
      
      console.log('\n🔍 验证结果:');
      console.log(`runOn值: ${runOnValue}`);
      
      // 应用新的runOn映射策略：16->0, 17->1
      let mappedRunOn = runOnValue;
      if (runOnValue === 16) {
        mappedRunOn = 0;
      } else if (runOnValue === 17) {
        mappedRunOn = 1;
      }
      
      console.log(`映射后值: ${mappedRunOn}`);
      console.log(`power_status: ${latestProp.power_status}`);
      
      if ((mappedRunOn === 1 && latestProp.power_status === true) || 
          (mappedRunOn === 0 && latestProp.power_status === false)) {
        console.log('✅ runOn字段映射验证成功！');
        console.log('   - runOn=17映射为1时，power_status正确设置为true');
        console.log('   - runOn=16映射为0时，power_status正确设置为false');
      } else {
        console.log('❌ runOn字段映射验证失败');
        console.log(`   期望: runOn=${runOnValue} -> 映射=${mappedRunOn} -> power_status=${mappedRunOn === 1}`);
        console.log(`   实际: power_status=${latestProp.power_status}`);
      }
    } else if (runOnData.length === 0) {
      console.log('\n⚠️  无法验证runOn字段修复效果：未找到包含runOn的数据记录');
    }
    
  } catch (error) {
    console.error('❌ 验证过程中发生错误:', error.message);
  } finally {
    await pool.end();
  }
}

verifyRunOnFix();