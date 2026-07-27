const express = require('express');
require('dotenv').config();

console.log('=== 开始逐步调试启动过程 ===');

const app = express();
const PORT = process.env.PORT || 3003;

async function stepByStepDebug() {
  try {
    console.log('步骤1: 基础Express应用创建 ✓');
    
    console.log('步骤2: 加载数据库配置...');
    const { sequelize } = require('./config/database');
    console.log('步骤2: 数据库配置加载 ✓');
    
    console.log('步骤3: 测试数据库连接...');
    await sequelize.authenticate();
    console.log('步骤3: 数据库连接成功 ✓');
    
    console.log('步骤4: 加载logger...');
    const logger = require('./utils/logger');
    console.log('步骤4: logger加载成功 ✓');
    
    console.log('步骤5: 加载models/index.js...');
    const models = require('./models');
    console.log('步骤5: models加载成功 ✓');
    
    console.log('步骤6: 加载MultiUnitAc模型...');
    const MultiUnitAc = require('./models/MultiUnitAc');
    console.log('步骤6: MultiUnitAc模型加载成功 ✓');
    
    console.log('步骤7: 加载multiUnitAcController...');
    const multiUnitAcController = require('./controllers/multiUnitAcController');
    console.log('步骤7: multiUnitAcController加载成功 ✓');
    
    console.log('步骤8: 加载multiUnitAc路由...');
    const multiUnitAcRoutes = require('./routes/multiUnitAc');
    console.log('步骤8: multiUnitAc路由加载成功 ✓');
    
    console.log('步骤9: 启动HTTP服务器...');
    app.use(express.json());
    app.get('/health', (req, res) => {
      res.json({ status: 'OK', timestamp: new Date().toISOString() });
    });
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`步骤9: 服务器启动成功，端口: ${PORT} ✓`);
    });
    
    console.log('=== 所有步骤完成，服务器运行正常 ===');
    
  } catch (error) {
    console.error('❌ 启动失败在某个步骤:', error.message);
    console.error('错误堆栈:', error.stack);
    process.exit(1);
  }
}

// 启动调试
stepByStepDebug();

module.exports = app;