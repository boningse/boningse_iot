const fs = require('fs');
const path = require('path');
const { sequelize } = require('./models');

async function runMigration() {
  try {
    console.log('开始执行迁移...');
    
    // 读取迁移文件
    const migrationPath = path.join(__dirname, 'migrations', 'add_sub_device_sequence_to_devices.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('迁移SQL内容:');
    console.log(migrationSQL);
    
    // 分割SQL语句（按分号分割）
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--'));
    
    console.log(`\n准备执行 ${statements.length} 条SQL语句...`);
    
    // 逐条执行SQL语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement) {
        console.log(`\n执行语句 ${i + 1}: ${statement.substring(0, 100)}...`);
        try {
          await sequelize.query(statement);
          console.log(`✓ 语句 ${i + 1} 执行成功`);
        } catch (error) {
          if (error.message.includes('already exists') || error.message.includes('column "sub_device_sequence" of relation "devices" already exists')) {
            console.log(`⚠ 语句 ${i + 1} 跳过（字段已存在）: ${error.message}`);
          } else {
            console.error(`✗ 语句 ${i + 1} 执行失败:`, error.message);
            throw error;
          }
        }
      }
    }
    
    console.log('\n迁移执行完成！');
    
    // 验证字段是否存在
    console.log('\n验证字段是否存在...');
    const [results] = await sequelize.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'devices' AND column_name LIKE '%sequence%'
      ORDER BY column_name;
    `);
    
    console.log('devices表中包含sequence的字段:');
    console.table(results);
    
    process.exit(0);
  } catch (error) {
    console.error('迁移执行失败:', error);
    process.exit(1);
  }
}

runMigration();