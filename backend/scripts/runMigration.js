const { sequelize } = require('../models');
const migration = require('../migrations/add_collection_interval_to_electric_meters');

/**
 * 执行数据库迁移脚本
 */
async function runMigration() {
  try {
    console.log('开始执行数据库迁移...');
    
    // 执行迁移
    await migration.up(sequelize.getQueryInterface(), sequelize.constructor);
    
    console.log('✅ 数据库迁移执行成功');
    
  } catch (error) {
    console.error('❌ 数据库迁移执行失败:', error);
    process.exit(1);
  } finally {
    // 关闭数据库连接
    await sequelize.close();
    process.exit(0);
  }
}

// 执行迁移
runMigration();