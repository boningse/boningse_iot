const axios = require('axios');
const { User, sequelize } = require('../models');
const jwt = require('jsonwebtoken');

/**
 * 测试电表API的collection_interval字段功能
 */
async function testElectricMeterAPI() {
  try {
    console.log('开始测试电表API的collection_interval字段功能...');
    
    // 创建测试用的JWT令牌
    const testUser = await User.findOne({ where: { role: 'admin' } });
    if (!testUser) {
      console.log('❌ 未找到管理员用户，无法进行API测试');
      return;
    }
    
    const token = jwt.sign(
      { 
        id: testUser.id, 
        username: testUser.username, 
        role: testUser.role,
        tenant_id: testUser.tenant_id 
      },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1h' }
    );
    
    const baseURL = 'http://localhost:3003/api';
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
    
    // 测试获取电表列表
    console.log('\n1. 测试获取电表列表...');
    try {
      const response = await axios.get(`${baseURL}/electric-meters`, { headers });
      if (response.data.success) {
        console.log('✅ 获取电表列表成功');
        if (response.data.data && response.data.data.length > 0) {
          const firstMeter = response.data.data[0];
          console.log(`   第一个电表的采集频率: ${firstMeter.collection_interval || '未设置'}分钟`);
        }
      } else {
        console.log('❌ 获取电表列表失败:', response.data.message);
      }
    } catch (error) {
      console.log('❌ 获取电表列表请求失败:', error.message);
    }
    
    console.log('\n✅ 电表API collection_interval字段测试完成');
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    // 关闭数据库连接
    await sequelize.close();
    process.exit(0);
  }
}

// 执行测试
testElectricMeterAPI();