const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// 数据库配置
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'iot_device_management',
  password: process.env.DB_PASSWORD || '123456',
  port: process.env.DB_PORT || 5432,
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    // 读取SQL文件
    const sqlFile = path.join(__dirname, 'migrations', 'create_multi_unit_ac_tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    console.log('开始执行多联机数据表创建迁移...');
    
    // 执行SQL
    await client.query(sql);
    
    console.log('✅ 多联机数据表创建成功！');
    console.log('已创建以下表:');
    console.log('- multi_unit_ac_hosts (多联机主机表)');
    console.log('- multi_unit_ac_indoor_units (多联机内机表)');
    console.log('- multi_unit_ac_control_logs (多联机控制日志表)');
    console.log('- multi_unit_ac_runtime_stats (多联机运行统计表)');
    console.log('- multi_unit_ac_groups (多联机分组表)');
    console.log('- multi_unit_ac_group_members (多联机分组成员表)');
    
  } catch (error) {
    console.error('❌ 迁移执行失败:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// 执行迁移
runMigration().catch(console.error);