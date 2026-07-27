const jwt = require('jsonwebtoken');
const { User } = require('./models');
const axios = require('axios');

async function verifyJWTFields() {
  try {
    console.log('=== 获取token ===');
    const loginResponse = await axios.post('http://localhost:3003/api/auth/login', {
      username: 'admin',
      password: 'admin123'
    });
    
    const token = loginResponse.data.data.token;
    console.log('Token获取成功');
    
    console.log('\n=== 解码JWT ===');
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    console.log('JWT解码结果完整内容:', JSON.stringify(decoded, null, 2));
    
    console.log('\n=== 使用正确的字段查询用户 ===');
    const userId = decoded.id; // 使用id字段而不是userId
    console.log('使用的用户ID:', userId);
    
    const user = await User.findByPk(userId);
    console.log('用户查询结果:', {
      found: !!user,
      id: user ? user.id : null,
      username: user ? user.username : null,
      status: user ? user.status : null,
      role: user ? user.role : null
    });
    
    console.log('\n=== 验证逻辑 ===');
    if (!user) {
      console.log('❌ 用户不存在');
    } else if (user.status !== 'active') {
      console.log('❌ 用户状态不是active:', user.status);
    } else {
      console.log('✅ 用户验证通过');
    }
    
    process.exit(0);
    
  } catch (error) {
    console.error('调试失败:', error.message);
    console.error('错误详情:', error);
    process.exit(1);
  }
}

verifyJWTFields();
