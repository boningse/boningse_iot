const { Client } = require('pg');
const axios = require('axios');
require('dotenv').config();

async function checkRoomStatus() {
  console.log('🔍 检查201和202房间温控器状态...');
  
  // 数据库连接配置
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'iot_device_management',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres'
  });
  
  try {
    // 1. 连接数据库
    await client.connect();
    console.log('✅ 数据库连接成功');
    
    // 2. 查询201和202房间的设备
    console.log('\n📋 步骤1: 查询201和202房间的设备信息');
    const devicesQuery = `
      SELECT 
        d.id,
        d.name,
        d.device_id,
        d.imei,
        d.status,
        d.location,
        d.updated_at,
        dt.name as device_type
      FROM devices d
      LEFT JOIN device_types dt ON d.device_type_id = dt.id
      WHERE d.location LIKE '%201%' OR d.location LIKE '%202%'
      ORDER BY d.location, d.name;
    `;
    
    const devicesResult = await client.query(devicesQuery);
    const devices = devicesResult.rows;
    
    console.log(`📊 找到 ${devices.length} 个相关设备:`);
    devices.forEach((device, index) => {
      console.log(`  ${index + 1}. ${device.name} (${device.device_id})`);
      console.log(`     位置: ${device.location}`);
      console.log(`     状态: ${device.status}`);
      console.log(`     类型: ${device.device_type}`);
      console.log(`     IMEI: ${device.imei}`);
      console.log(`     更新时间: ${device.updated_at}`);
      console.log('');
    });
    
    // 3. 查询最新的设备数据
    console.log('\n📊 步骤2: 查询最新的设备数据');
    for (const device of devices) {
      console.log(`\n🔍 检查设备: ${device.name} (${device.device_id})`);
      
      // 查询最新的设备数据
      const dataQuery = `
        SELECT 
          data_type,
          payload,
          quality,
          timestamp,
          received_at
        FROM device_data 
        WHERE device_id = $1 
        ORDER BY received_at DESC 
        LIMIT 5;
      `;
      
      const dataResult = await client.query(dataQuery, [device.id]);
      const deviceData = dataResult.rows;
      
      if (deviceData.length > 0) {
        console.log(`   📈 最新的 ${deviceData.length} 条数据记录:`);
        deviceData.forEach((data, index) => {
          console.log(`     ${index + 1}. [${data.data_type}] ${data.received_at}`);
          
          // 解析payload中的关键信息
          if (data.payload) {
            try {
              const payload = typeof data.payload === 'string' ? JSON.parse(data.payload) : data.payload;
              
              // 查找电源状态相关字段
              const powerFields = ['power', 'powerStatus', 'status', 'switch', 'on', 'enabled'];
              const tempFields = ['temperature', 'temp', 'roomTemp', 'setTemp'];
              
              powerFields.forEach(field => {
                if (payload.hasOwnProperty(field)) {
                  console.log(`        电源状态 (${field}): ${payload[field]}`);
                }
              });
              
              tempFields.forEach(field => {
                if (payload.hasOwnProperty(field)) {
                  console.log(`        温度 (${field}): ${payload[field]}`);
                }
              });
              
              // 显示完整payload（截断显示）
              const payloadStr = JSON.stringify(payload);
              if (payloadStr.length > 200) {
                console.log(`        完整数据: ${payloadStr.substring(0, 200)}...`);
              } else {
                console.log(`        完整数据: ${payloadStr}`);
              }
              
            } catch (e) {
              console.log(`        原始数据: ${data.payload}`);
            }
          }
          console.log('');
        });
      } else {
        console.log('   ❌ 没有找到设备数据记录');
      }
    }
    
    // 4. 获取API中的设备状态
    console.log('\n🌐 步骤3: 通过API获取设备状态');
    
    try {
      // 获取认证token
      const loginResponse = await axios.post('http://localhost:3003/api/auth/login', {
        username: 'apple',
        password: '225788'
      });
      
      const token = loginResponse.data.data.token;
      console.log('✅ 获取API认证token成功');
      
      // 获取设备列表
      const apiDevicesResponse = await axios.get('http://localhost:3003/api/devices', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      const apiDevices = apiDevicesResponse.data.data.list;
      console.log(`📊 API返回 ${apiDevices.length} 个设备`);
      
      // 筛选201和202房间的设备
      const roomDevices = apiDevices.filter(device => 
        device.location && (device.location.includes('201') || device.location.includes('202'))
      );
      
      console.log(`🎯 201和202房间相关设备 ${roomDevices.length} 个:`);
      roomDevices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device.name} (${device.device_id})`);
        console.log(`     位置: ${device.location}`);
        console.log(`     API状态: ${device.status}`);
        console.log(`     在线状态: ${device.online ? '在线' : '离线'}`);
        console.log(`     最后通信: ${device.last_communication}`);
        
        // 显示最新数据
        if (device.latest_data) {
          console.log(`     最新数据: ${JSON.stringify(device.latest_data).substring(0, 150)}...`);
        }
        console.log('');
      });
      
    } catch (apiError) {
      console.log('❌ API请求失败:', apiError.message);
    }
    
    // 5. 对比分析
    console.log('\n📋 步骤4: 状态对比分析');
    console.log('数据库设备状态 vs API设备状态:');
    
    devices.forEach(dbDevice => {
      console.log(`\n🔍 设备: ${dbDevice.name}`);
      console.log(`  数据库状态: ${dbDevice.status}`);
      console.log(`  位置: ${dbDevice.location}`);
      
      // 查找对应的API设备
      const apiDevice = roomDevices?.find(api => 
        api.device_id === dbDevice.device_id || api.imei === dbDevice.imei
      );
      
      if (apiDevice) {
        console.log(`  API状态: ${apiDevice.status}`);
        console.log(`  在线状态: ${apiDevice.online ? '在线' : '离线'}`);
        
        if (dbDevice.status !== apiDevice.status) {
          console.log(`  ⚠️ 状态不一致! 数据库: ${dbDevice.status}, API: ${apiDevice.status}`);
        } else {
          console.log(`  ✅ 状态一致: ${dbDevice.status}`);
        }
      } else {
        console.log(`  ❌ 在API中未找到对应设备`);
      }
    });
    
    console.log('\n✅ 房间状态检查完成');
    
  } catch (error) {
    console.error('❌ 检查过程中发生错误:', error.message);
    console.error('错误详情:', error);
  } finally {
    await client.end();
  }
}

checkRoomStatus();