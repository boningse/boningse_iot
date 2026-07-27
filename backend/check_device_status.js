const db = require('./utils/database');

(async () => {
  try {
    console.log('查询power_status为true的设备...');
    const result = await db.query(`
      SELECT 
        d.id,
        d.name,
        d.imei,
        tp.power_status,
        tp.current_temperature,
        tp.target_temp,
        tp.last_data_time
      FROM devices d
      LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
      WHERE tp.power_status = true
      ORDER BY tp.last_data_time DESC
      LIMIT 5
    `);
    
    console.log('power_status为true的设备:');
    console.table(result.rows);
    
    console.log('\n查询所有设备的power_status状态...');
    const allResult = await db.query(`
      SELECT 
        d.id,
        d.name,
        d.imei,
        tp.power_status,
        tp.last_data_time
      FROM devices d
      LEFT JOIN thermostat_properties tp ON d.id = tp.device_id
      ORDER BY tp.last_data_time DESC NULLS LAST
      LIMIT 10
    `);
    
    console.log('所有设备状态:');
    console.table(allResult.rows);
    
    process.exit(0);
  } catch (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }
})();