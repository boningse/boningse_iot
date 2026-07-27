const { sequelize } = require('./config/database');

async function checkDevice() {
  try {
    const query = `
      SELECT 
        d.id,
        d.name,
        d.device_id,
        d.tenant_id,
        d.manufacturer_code,
        d.protocol_config_id,
        d.parent_device_id,
        pc.command_config,
        pc.name as protocol_name
      FROM devices d
      LEFT JOIN protocol_configs pc ON d.protocol_config_id = pc.id
      WHERE d.device_id = '91fe87ef-cd76-4532-8c2c-fb0a61712c87'
    `;
    
    const [results] = await sequelize.query(query);
    console.log('设备信息:', JSON.stringify(results[0], null, 2));
    
    if (result.rows[0]) {
      const device = result.rows[0];
      console.log('\n设备状态分析:');
      console.log('- 设备ID:', device.device_id);
      console.log('- 租户ID:', device.tenant_id);
      console.log('- 协议配置ID:', device.protocol_config_id);
      console.log('- 协议名称:', device.protocol_name);
      console.log('- 命令配置存在:', !!device.command_config);
      console.log('- 父设备ID:', device.parent_device_id);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('查询失败:', error);
    process.exit(1);
  }
}

checkDevice();