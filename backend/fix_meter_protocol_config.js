const { Pool } = require('pg');
require('dotenv').config();

// 数据库连接配置
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'iot_db',
  user: process.env.DB_USER || 'iot_user',
  password: process.env.DB_PASSWORD || 'iot_password'
});

/**
 * 修复电表协议配置关联
 * 将没有协议配置的电表关联到现有的Modbus协议配置
 */
async function fixMeterProtocolConfig() {
  const client = await pool.connect();
  
  try {
    console.log('=== 开始修复电表协议配置关联 ===');
    
    // 1. 查找没有协议配置的活跃电表
    const metersQuery = `
      SELECT id, meter_number, meter_address, protocol_config_id
      FROM electric_meters 
      WHERE status = 'active' AND protocol_config_id IS NULL;
    `;
    
    const metersResult = await client.query(metersQuery);
    const meters = metersResult.rows;
    
    console.log(`找到 ${meters.length} 个没有协议配置的电表:`);
    meters.forEach(meter => {
      console.log(`  - ${meter.meter_number} (ID: ${meter.id})`);
    });
    
    if (meters.length === 0) {
      console.log('所有电表都已有协议配置，无需修复。');
      return;
    }
    
    // 2. 查找可用的Modbus协议配置
    const protocolQuery = `
      SELECT id, name, protocol_type, status
      FROM protocol_configs 
      WHERE protocol_type = 'modbus' AND status = 'active'
      ORDER BY created_at LIMIT 1;
    `;
    
    const protocolResult = await client.query(protocolQuery);
    const protocols = protocolResult.rows;
    
    if (protocols.length === 0) {
      console.error('❌ 没有找到可用的Modbus协议配置！');
      return;
    }
    
    const protocol = protocols[0];
    console.log(`\n使用协议配置: ${protocol.name} (ID: ${protocol.id})`);
    
    // 3. 更新电表的协议配置关联
    const updateQuery = `
      UPDATE electric_meters 
      SET protocol_config_id = $1, updated_at = NOW()
      WHERE status = 'active' AND protocol_config_id IS NULL;
    `;
    
    const updateResult = await client.query(updateQuery, [protocol.id]);
    
    console.log(`\n✅ 成功更新了 ${updateResult.rowCount} 个电表的协议配置关联`);
    
    // 4. 验证更新结果
    const verifyQuery = `
      SELECT 
        em.id,
        em.meter_number,
        em.meter_address,
        pc.name as protocol_name,
        pc.protocol_type
      FROM electric_meters em
      JOIN protocol_configs pc ON em.protocol_config_id = pc.id
      WHERE em.status = 'active';
    `;
    
    const verifyResult = await client.query(verifyQuery);
    const updatedMeters = verifyResult.rows;
    
    console.log('\n=== 更新后的电表配置 ===');
    updatedMeters.forEach(meter => {
      console.log(`电表: ${meter.meter_number}`);
      console.log(`  地址: ${meter.meter_address}`);
      console.log(`  协议: ${meter.protocol_name} (${meter.protocol_type})`);
      console.log('');
    });
    
    console.log('=== 修复完成 ===');
    
  } catch (error) {
    console.error('修复过程中发生错误:', error);
  } finally {
    client.release();
    await pool.end();
    process.exit(0);
  }
}

// 运行修复
fixMeterProtocolConfig();