const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

async function checkAllDevices() {
  console.log('🔍 检查所有设备的位置和状态信息...');
  
  try {
    // 1. 通过API获取所有设备
    console.log('\n📝 步骤1: 获取认证token');
    const loginResponse = await axios.post('http://localhost:3003/api/auth/login', {
      username: 'apple',
      password: '225788'
    });
    
    const token = loginResponse.data.data.token;
    console.log('✅ 获取token成功');
    
    // 2. 获取设备列表
    console.log('\n📋 步骤2: 获取所有设备列表');
    const devicesResponse = await axios.get('http://localhost:3003/api/devices', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const devices = devicesResponse.data.data.list;
    console.log(`📊 总共找到 ${devices.length} 个设备`);
    
    // 3. 显示所有设备的详细信息
    console.log('\n📋 所有设备详细信息:');
    devices.forEach((device, index) => {
      console.log(`\n${index + 1}. 设备名称: ${device.name}`);
      console.log(`   设备ID: ${device.device_id}`);
      console.log(`   IMEI: ${device.imei}`);
      console.log(`   位置: ${device.location || '未设置'}`);
      console.log(`   状态: ${device.status}`);
      console.log(`   在线: ${device.online ? '是' : '否'}`);
      console.log(`   设备类型: ${device.device_type?.name || '未知'}`);
      console.log(`   最后通信: ${device.last_communication || '无'}`);
      
      // 显示最新数据
      if (device.latest_data) {
        console.log(`   最新数据: ${JSON.stringify(device.latest_data)}`);
      } else {
        console.log(`   最新数据: 无`);
      }
    });
    
    // 4. 筛选可能是温控器的设备
    console.log('\n🌡️ 步骤3: 筛选温控器设备');
    const thermostatDevices = devices.filter(device => {
      const name = device.name?.toLowerCase() || '';
      const type = device.device_type?.name?.toLowerCase() || '';
      const location = device.location?.toLowerCase() || '';
      
      return name.includes('温控') || 
             name.includes('thermostat') || 
             name.includes('therm') ||
             type.includes('温控') || 
             type.includes('thermostat') ||
             location.includes('201') ||
             location.includes('202');
    });
    
    console.log(`🎯 找到 ${thermostatDevices.length} 个可能的温控器设备:`);
    thermostatDevices.forEach((device, index) => {
      console.log(`\n  ${index + 1}. ${device.name}`);
      console.log(`     位置: ${device.location || '未设置'}`);
      console.log(`     状态: ${device.status}`);
      console.log(`     在线: ${device.online ? '是' : '否'}`);
      console.log(`     设备类型: ${device.device_type?.name || '未知'}`);
      
      // 分析最新数据中的电源状态
      if (device.latest_data) {
        const data = device.latest_data;
        console.log(`     最新数据分析:`);
        
        // 查找电源相关字段
        const powerFields = ['power', 'powerStatus', 'status', 'switch', 'on', 'enabled', 'state'];
        const tempFields = ['temperature', 'temp', 'roomTemp', 'setTemp', 'targetTemp'];
        
        powerFields.forEach(field => {
          if (data.hasOwnProperty(field)) {
            console.log(`       电源状态 (${field}): ${data[field]}`);
          }
        });
        
        tempFields.forEach(field => {
          if (data.hasOwnProperty(field)) {
            console.log(`       温度 (${field}): ${data[field]}`);
          }
        });
        
        // 显示所有字段
        console.log(`       所有字段: ${JSON.stringify(data)}`);
      }
    });
    
    // 5. 数据库查询验证
    console.log('\n💾 步骤4: 数据库验证');
    const client = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'iot_device_management',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres'
    });
    
    await client.connect();
    console.log('✅ 数据库连接成功');
    
    // 查询所有设备的位置信息
    const dbQuery = `
      SELECT 
        d.id,
        d.name,
        d.device_id,
        d.imei,
        d.status,
        d.location,
        d.updated_at,
        dt.name as device_type_name
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      ORDER BY d.location, d.name;
    `;
    
    const dbResult = await client.query(dbQuery);
    const dbDevices = dbResult.rows;
    
    console.log(`📊 数据库中共有 ${dbDevices.length} 个设备:`);
    dbDevices.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.name} - 位置: ${device.location || '未设置'} - 状态: ${device.status}`);
    });
    
    // 查找包含201或202的设备
    const roomDevices = dbDevices.filter(device => {
      const location = device.location || '';
      const name = device.name || '';
      return location.includes('201') || location.includes('202') || 
             name.includes('201') || name.includes('202');
    });
    
    console.log(`\n🏠 包含201或202的设备 ${roomDevices.length} 个:`);
    roomDevices.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.name}`);
      console.log(`     位置: ${device.location}`);
      console.log(`     状态: ${device.status}`);
      console.log(`     设备类型: ${device.device_type_name}`);
    });
    
    await client.end();
    console.log('\n✅ 设备检查完成');
    
  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error.message);
    if (error.response) {
      console.error('响应数据:', error.response.data);
    }
  }
}

checkAllDevices();