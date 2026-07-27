const { ElectricMeter, sequelize } = require('../models');
const logger = require('../utils/logger');

/**
 * 同步电表管理表到数据库
 * 创建 electric_meters 表及其索引
 */
async function syncElectricMeterTable() {
  try {
    console.log('开始同步电表管理表...');
    
    // 同步 ElectricMeter 模型到数据库
    await ElectricMeter.sync({ force: false });
    
    console.log('✅ 电表管理表同步成功');
    console.log('表名: electric_meters');
    console.log('包含字段: id, name, meter_number, meter_address, device_id, tenant_id, manufacturer_id, protocol_config_id, status, description, created_by, created_at, updated_at');
    
  } catch (error) {
    console.error('❌ 电表管理表同步失败:', error.message);
    logger.error('ElectricMeter table sync failed:', error);
    throw error;
  }
}

/**
 * 验证表是否创建成功
 */
async function verifyTable() {
  try {
    const [results] = await sequelize.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'electric_meters' AND table_schema = 'public'"
    );
    
    if (results.length > 0) {
      console.log('✅ 表验证成功: electric_meters 表已存在');
      
      // 检查表结构
      const [columns] = await sequelize.query(
        "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'electric_meters' ORDER BY ordinal_position"
      );
      
      console.log('表结构:');
      columns.forEach(col => {
        console.log(`  - ${col.column_name}: ${col.data_type} ${col.is_nullable === 'NO' ? '(NOT NULL)' : '(NULLABLE)'}`);
      });
      
    } else {
      console.log('❌ 表验证失败: electric_meters 表不存在');
    }
  } catch (error) {
    console.error('表验证出错:', error.message);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  (async () => {
    try {
      await syncElectricMeterTable();
      await verifyTable();
      process.exit(0);
    } catch (error) {
      console.error('脚本执行失败:', error);
      process.exit(1);
    }
  })();
}

module.exports = {
  syncElectricMeterTable,
  verifyTable
};