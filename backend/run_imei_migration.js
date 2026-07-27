const fs = require('fs');
const path = require('path');
const { sequelize } = require('./models');

async function runImeiMigration() {
  try {
    console.log('开始执行IMEI约束修改迁移...');
    
    // 读取迁移文件
    const migrationPath = path.join(__dirname, 'migrations', 'modify_imei_constraint_for_sub_devices.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    console.log('迁移SQL内容:');
    console.log(migrationSQL);
    
    // 分割SQL语句（按分号分割，但保留多行语句）
    const statements = migrationSQL
      .split(/;\s*(?=\n|$)/)
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--') && !stmt.match(/^SELECT/i));
    
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
          if (error.message.includes('does not exist') || 
              error.message.includes('already exists') ||
              error.message.includes('constraint') && error.message.includes('already exists')) {
            console.log(`⚠ 语句 ${i + 1} 跳过（约束不存在或已存在）: ${error.message}`);
          } else {
            console.error(`✗ 语句 ${i + 1} 执行失败:`, error.message);
            // 对于某些错误，我们继续执行而不是抛出异常
            if (!error.message.includes('CONCURRENTLY cannot be used inside a transaction')) {
              throw error;
            } else {
              console.log(`⚠ 跳过CONCURRENTLY索引创建，将使用普通索引创建`);
              // 尝试不使用CONCURRENTLY创建索引
              const modifiedStatement = statement.replace(/CONCURRENTLY\s+/gi, '');
              try {
                await sequelize.query(modifiedStatement);
                console.log(`✓ 语句 ${i + 1} 修改后执行成功`);
              } catch (retryError) {
                console.log(`⚠ 修改后仍然失败，跳过: ${retryError.message}`);
              }
            }
          }
        }
      }
    }
    
    console.log('\n迁移执行完成！');
    
    // 验证约束是否正确创建
    console.log('\n验证IMEI相关约束...');
    try {
      const [constraints] = await sequelize.query(`
        SELECT 
            conname,
            contype,
            pg_get_constraintdef(oid) as definition
        FROM pg_constraint 
        WHERE conrelid = 'devices'::regclass
        AND (conname LIKE '%imei%' OR conname LIKE '%sub_device%' OR conname LIKE '%parent%')
        ORDER BY conname
      `);
      
      console.log('设备表约束:');
      console.table(constraints);
    } catch (error) {
      console.log('查询约束时出错:', error.message);
    }
    
    // 验证索引是否正确创建
    console.log('\n验证IMEI相关索引...');
    try {
      const [indexes] = await sequelize.query(`
        SELECT 
            schemaname,
            tablename,
            indexname,
            indexdef
        FROM pg_indexes 
        WHERE tablename = 'devices' 
        AND (indexname LIKE '%imei%' OR indexname LIKE '%sub_device%')
        ORDER BY indexname
      `);
      
      console.log('设备表索引:');
      console.table(indexes);
    } catch (error) {
      console.log('查询索引时出错:', error.message);
    }
    
  } catch (error) {
    console.error('迁移执行失败:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runImeiMigration();