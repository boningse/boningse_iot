const { Pool } = require('pg');

// 数据库配置
const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'iot_device_management',
  password: '123456',
  port: 5432,
});

async function checkThermostatDevices() {
  try {
    console.log('🔍 查询温控器设备...\n');
    
    // 查询温控器设备
    const deviceQuery = `
      SELECT 
        d.id, 
        d.name, 
        d.device_id, 
        d.imei, 
        d.status,
        d.tenant_id,
        dt.name as device_type,
        tp.current_temperature,
        tp.target_temp,
        tp.power_status,
        tp.ac_mode
      FROM devices d 
      LEFT JOIN device_types dt ON d.device_type_id = dt.id 
      LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
      WHERE dt.name = '空调温控器' 
      ORDER BY d.created_at DESC
      LIMIT 10
    `;
    
    const result = await pool.query(deviceQuery);
    
    if (result.rows.length === 0) {
      console.log('❌ 没有找到温控器设备');
    } else {
      console.log(`✅ 找到 ${result.rows.length} 个温控器设备:\n`);
      result.rows.forEach((device, index) => {
        console.log(`${index + 1}. 设备信息:`);
        console.log(`   ID: ${device.id}`);
        console.log(`   名称: ${device.name}`);
        console.log(`   设备ID: ${device.device_id}`);
        console.log(`   IMEI: ${device.imei}`);
        console.log(`   状态: ${device.status}`);
        console.log(`   租户ID: ${device.tenant_id}`);
        console.log(`   当前温度: ${device.current_temperature}°C`);
        console.log(`   目标温度: ${device.target_temp}°C`);
        console.log(`   电源状态: ${device.power_status ? '开启' : '关闭'}`);
        console.log(`   空调模式: ${device.ac_mode}`);
        console.log('');
      });
    }
    
    // 查询设备类型
    console.log('📋 查询设备类型...\n');
    const typeQuery = `SELECT id, name FROM device_types WHERE name LIKE '%温控%' OR name LIKE '%空调%'`;
    const typeResult = await pool.query(typeQuery);
    
    if (typeResult.rows.length > 0) {
      console.log('设备类型:');
      typeResult.rows.forEach(type => {
        console.log(`   ID: ${type.id}, 名称: ${type.name}`);
      });
    }
    
  } catch (error) {
    console.error('❌ 查询失败:', error.message);
  } finally {
    await pool.end();
  }
}

checkThermostatDevices();