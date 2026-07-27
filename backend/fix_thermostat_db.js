const { Pool } = require('pg');

// 数据库连接配置
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'iot_device_management',
  user: 'postgres',
  password: '123456'
});

async function fixThermostatDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('开始修复温控器数据库...');
    
    // 检查thermostat_properties表是否存在
    const checkTable = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'thermostat_properties'
    `);
    
    if (checkTable.rows.length === 0) {
      console.log('创建thermostat_properties表...');
      await client.query(`
        CREATE TABLE thermostat_properties (
          id BIGSERIAL PRIMARY KEY,
          device_id UUID NOT NULL UNIQUE,
          group_id BIGINT,
          power_status BOOLEAN DEFAULT false,
          current_temperature DECIMAL(4,1),
          target_temp DECIMAL(4,1) DEFAULT 24.0,
          temp_locked BOOLEAN DEFAULT false,
          fan_speed INTEGER DEFAULT 1,
          ac_mode VARCHAR(20) DEFAULT 'cool',
          runtime_speed1 BIGINT DEFAULT 0,
          runtime_speed2 BIGINT DEFAULT 0,
          runtime_speed3 BIGINT DEFAULT 0,
          last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);
    } else {
      console.log('thermostat_properties表已存在');
    }
    
    // 检查是否有空调温控器设备类型
    const checkDeviceType = await client.query(`
      SELECT id FROM device_types WHERE name = '空调温控器'
    `);
    
    if (checkDeviceType.rows.length === 0) {
      console.log('创建空调温控器设备类型...');
      await client.query(`
        INSERT INTO device_types (name, description, protocol, created_at)
        VALUES ('空调温控器', '空调温控器设备', 'mqtt', NOW())
      `);
    }
    
    // 创建一些测试数据
    const deviceTypeResult = await client.query(`
      SELECT id FROM device_types WHERE name = '空调温控器'
    `);
    const deviceTypeId = deviceTypeResult.rows[0].id;
    
    // 获取默认租户ID
    const tenantResult = await client.query(`
      SELECT id FROM tenants WHERE code = 'default' LIMIT 1
    `);
    
    if (tenantResult.rows.length > 0) {
      const tenantId = tenantResult.rows[0].id;
      
      // 检查是否已有测试设备
      const existingDevices = await client.query(`
        SELECT COUNT(*) as count FROM devices d
        JOIN device_types dt ON d.device_type_id = dt.id
        WHERE dt.name = '空调温控器'
      `);
      
      if (parseInt(existingDevices.rows[0].count) === 0) {
        console.log('创建测试温控器设备...');
        
        // 创建测试设备
        for (let i = 1; i <= 3; i++) {
          const deviceResult = await client.query(`
            INSERT INTO devices (name, device_id, device_type_id, status, location, tenant_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING id
          `, [
            `测试温控器${i}`,
            `THERMOSTAT_${String(i).padStart(3, '0')}`,
            deviceTypeId,
            'online',
            `办公室${i}`,
            tenantId
          ]);
          
          const deviceId = deviceResult.rows[0].id;
          
          // 创建温控器属性
          await client.query(`
            INSERT INTO thermostat_properties (
              device_id, current_temperature, target_temp, ac_mode, fan_speed, power_status, temp_locked
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            deviceId,
            20 + Math.random() * 10, // 随机当前温度 20-30度
            24 + i, // 目标温度
            ['cool', 'heat', 'fan'][i % 3], // 随机模式
            i, // 风速
            i % 2 === 1, // 随机开关状态
            false
          ]);
        }
        
        console.log('创建了3个测试温控器设备');
      } else {
        console.log(`已存在 ${existingDevices.rows[0].count} 个温控器设备`);
      }
    }
    
    console.log('温控器数据库修复完成!');
    
  } catch (error) {
    console.error('修复失败:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

fixThermostatDatabase().catch(console.error);