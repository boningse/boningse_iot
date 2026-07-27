const express = require('express');
const logger = require('./utils/logger');
require('dotenv').config();

console.log('=== 最小化应用启动 ===');
logger.info('开始启动最小化应用');

const app = express();
const PORT = process.env.PORT || 3006;

// 基础中间件
app.use(express.json());

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// 启动服务器
async function startMinimalServer() {
  try {
    console.log('正在启动HTTP服务器...');
    logger.info('正在启动HTTP服务器');
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`最小化服务器启动成功，端口: ${PORT}`);
      logger.info('最小化服务器启动成功', { port: PORT });
    });

    // 优雅关闭处理
    const gracefulShutdown = (signal) => {
      console.log(`收到${signal}信号，正在关闭服务器...`);
      logger.info(`收到${signal}信号，正在关闭服务器...`);
      
      server.close(() => {
        console.log('服务器已关闭');
        logger.info('服务器已关闭');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    console.error('启动失败:', error);
    logger.error('启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

console.log('调用startMinimalServer函数...');
startMinimalServer();

module.exports = app;