const { DataTypes } = require('sequelize');

/**
 * 添加采集频率字段到电表管理表
 * 迁移文件：add_collection_interval_to_electric_meters.js
 */
module.exports = {
  /**
   * 执行迁移 - 添加 collection_interval 字段
   */
  up: async (queryInterface, Sequelize) => {
    try {
      console.log('开始添加 collection_interval 字段到 electric_meters 表...');
      
      // 添加 collection_interval 字段
      await queryInterface.addColumn('electric_meters', 'collection_interval', {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 10,
        comment: '采集频率（分钟）'
      });
      
      console.log('✅ collection_interval 字段添加成功');
      
      // 为现有记录设置默认值
      await queryInterface.sequelize.query(
        'UPDATE electric_meters SET collection_interval = 10 WHERE collection_interval IS NULL'
      );
      
      console.log('✅ 现有记录默认值设置完成');
      
    } catch (error) {
      console.error('❌ 迁移失败:', error);
      throw error;
    }
  },

  /**
   * 回滚迁移 - 删除 collection_interval 字段
   */
  down: async (queryInterface, Sequelize) => {
    try {
      console.log('开始回滚 collection_interval 字段...');
      
      // 删除 collection_interval 字段
      await queryInterface.removeColumn('electric_meters', 'collection_interval');
      
      console.log('✅ collection_interval 字段删除成功');
      
    } catch (error) {
      console.error('❌ 回滚失败:', error);
      throw error;
    }
  }
};