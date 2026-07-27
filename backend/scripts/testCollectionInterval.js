const { ElectricMeter, sequelize } = require('../models');

/**
 * 测试 collection_interval 字段是否已正确添加
 */
async function testCollectionInterval() {
  try {
    console.log('开始测试 collection_interval 字段...');
    
    // 检查表结构
    const tableInfo = await sequelize.getQueryInterface().describeTable('electric_meters');
    
    if (tableInfo.collection_interval) {
      console.log('✅ collection_interval 字段存在于数据库中');
      console.log('字段信息:', tableInfo.collection_interval);
    } else {
      console.log('❌ collection_interval 字段不存在于数据库中');
      return;
    }
    
    // 查询现有电表记录
    const electricMeters = await ElectricMeter.findAll({
      attributes: ['id', 'name', 'collection_interval'],
      limit: 5
    });
    
    console.log('\n现有电表记录的采集频率:');
    electricMeters.forEach(meter => {
      console.log(`- ${meter.name}: ${meter.collection_interval}分钟`);
    });
    
    console.log('\n✅ collection_interval 字段测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    // 关闭数据库连接
    await sequelize.close();
    process.exit(0);
  }
}

// 执行测试
testCollectionInterval();