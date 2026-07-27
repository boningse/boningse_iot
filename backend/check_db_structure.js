/**
 * 检查数据库表结构
 */

const { sequelize } = require('./models');

async function checkDbStructure() {
  try {
    console.log('=== 检查数据库表结构 ===\n');
    
    // 检查manufacturers表结构
    console.log('1. manufacturers表结构:');
    const [manufacturersColumns] = await sequelize.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'manufacturers' ORDER BY ordinal_position;"
    );
    manufacturersColumns.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
    // 检查devices表结构
    console.log('\n2. devices表结构:');
    const [devicesColumns] = await sequelize.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'devices' ORDER BY ordinal_position;"
    );
    devicesColumns.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
    // 检查electric_meters表结构
    console.log('\n3. electric_meters表结构:');
    const [electricMetersColumns] = await sequelize.query(
      "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'electric_meters' ORDER BY ordinal_position;"
    );
    electricMetersColumns.forEach(col => {
      console.log(`  ${col.column_name}: ${col.data_type}`);
    });
    
  } catch (error) {
    console.error('❌ 检查数据库结构失败:', error.message);
  } finally {
    process.exit(0);
  }
}

checkDbStructure();