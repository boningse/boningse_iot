const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { corsMiddleware } = require('./middleware/cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const logger = require('./utils/logger');
require('dotenv').config();

// 导入定时任务调度器
const scheduler = require('./scheduler');

// 导入新的中间件
const { performanceMonitor, getPerformanceMetrics } = require('./middleware/performanceMonitor');
// 暂时禁用Redis依赖的中间件
// const { generalLimiter, authLimiter, uploadLimiter, queryLimiter } = require('./middleware/rateLimiter');
// const { concurrencyControl } = require('./middleware/concurrencyControl');

const { sequelize } = require('./config/database');
const mqttService = require('./services/mqttService');
const websocketService = require('./services/websocketService');
const schedulerService = require('./services/schedulerService');
const MessageProcessingService = require('./services/messageProcessingService');
const alarmService = require('./services/alarmService');

// 导入路由
const authRoutes = require('./routes/auth');
const deviceRoutes = require('./routes/devices');
const deviceConfigRoutes = require('./routes/deviceConfig');
const deviceTypeRoutes = require('./routes/deviceTypes');
const tenantRoutes = require('./routes/tenants');
const manufacturerRoutes = require('./routes/manufacturers');
const protocolConfigRoutes = require('./routes/protocolConfigs');
const projectManagementRoutes = require('./routes/projectManagement');
const lightingControlRoutes = require('./routes/lightingControl');
const switchControlRoutes = require('./routes/switchControl');
const airConditionerControlRoutes = require('./routes/airConditionerControl');
const lightingDataRoutes = require('./routes/lightingData');
const lightingScenesRoutes = require('./routes/lightingScenes');
const lightingTimerRoutes = require('./routes/lightingTimer');

const systemRoutes = require('./routes/system');
const userRoutes = require('./routes/users');
const testRoutes = require('./routes/test');
const thermostatRoutes = require('./routes/thermostat');
const eqinfoRoutes = require('./routes/eqinfo');
const alarmRoutes = require('./routes/alarms');


const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';
const enableTestRoutes = process.env.ENABLE_TEST_ROUTES === 'true';
const syncDatabaseOnStartup = process.env.DB_SYNC_ON_STARTUP === 'true';

// 服务只经过本机 Nginx 一层代理。
app.set('trust proxy', 1);

// 照明数据API的专用速率限制（测试期间放宽）
const lightingDataLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1分钟
  max: 1000, // 大幅增加限制以支持测试
  message: '照明数据请求过于频繁，请稍后再试'
});
// 中间件配置
app.use(helmet({ hsts: false })); // 安全头
app.use(compression()); // 压缩响应
app.use(performanceMonitor); // 性能监控
// app.use(concurrencyControl); // 并发控制 - 暂时禁用
// app.use(generalLimiter); // 通用速率限制 - 暂时禁用
app.use(corsMiddleware);
app.use(morgan('combined')); // 日志记录
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 健康检查端点
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// 性能指标端点
app.get('/metrics', (req, res) => {
  return getPerformanceMetrics(req, res);
});

// API路由
app.use('/api/auth', authRoutes); // 暂时移除authLimiter
app.use('/api/devices', deviceRoutes);
app.use('/api/device-config', deviceConfigRoutes);
app.use('/api/device-types', deviceTypeRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/project-management', projectManagementRoutes);
app.use('/api/manufacturers', manufacturerRoutes);
app.use('/api/protocol-configs', protocolConfigRoutes);
app.use('/api/lighting-control', lightingControlRoutes);
app.use('/api/switch-control', switchControlRoutes);
app.use('/api/air-conditioner-control', airConditionerControlRoutes);
app.use('/api/lighting-data', lightingDataLimiter, lightingDataRoutes);
app.use('/api/lighting-scenes', lightingScenesRoutes);
app.use('/api/lighting-timer', lightingTimerRoutes);

app.use('/api/system', systemRoutes);
app.use('/api/users', userRoutes);
if (!isProduction || enableTestRoutes) {
  app.use('/api/test', testRoutes);
} else {
  logger.info('生产环境未启用测试路由', { route: '/api/test' });
}
app.use('/api/thermostat', thermostatRoutes);
app.use('/api/v1/eqinfo', eqinfoRoutes);
app.use('/api/alarms', alarmRoutes);


// 404处理
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: '接口不存在',
    path: req.originalUrl
  });
});

// 全局错误处理
app.use((err, req, res, next) => {
  logger.error('全局错误处理', { error: err.message, stack: err.stack });

  // Joi验证错误
  if (err.isJoi) {
    return res.status(400).json({
      success: false,
      message: '参数验证失败',
      details: err.details.map(detail => detail.message)
    });
  }

  // Sequelize错误
  if (err.name === 'SequelizeValidationError') {
    return res.status(400).json({
      success: false,
      message: '数据验证失败',
      details: err.errors.map(error => error.message)
    });
  }

  // JWT错误
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: '无效的访问令牌'
    });
  }

  // 默认错误
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '服务器内部错误',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

/**
 * 启动服务器
 */
async function startServer() {
  try {
    // 测试数据库连接
    await sequelize.authenticate();
    logger.info('数据库连接成功');
  } catch (dbError) {
    logger.error('数据库连接失败，服务器无法启动', { error: dbError.message, stack: dbError.stack });
    process.exit(1); // 强制退出
  }

  try {

    if (syncDatabaseOnStartup) {
      try {
        await sequelize.sync({ force: false, alter: false });
        logger.info('数据库模型同步成功');
      } catch (syncError) {
        logger.error('数据库模型同步失败', { error: syncError.message });
        // 继续运行，但记录错误
      }
    } else {
      logger.info('启动时数据库模型同步已跳过', { env: 'DB_SYNC_ON_STARTUP' });
    }

    // 启动HTTP服务器（移除HTTPS）
    let server;
    server = http.createServer(app);
    server.listen(PORT, HOST, () => {
      logger.info('HTTP服务器启动成功', { port: PORT, host: HOST, environment: process.env.NODE_ENV || 'development', ssl: false });
    });
    
    // 启动WebSocket服务
    websocketService.init(server);
    logger.info('WebSocket服务启动成功');
    
    // 启动MQTT服务
    try {
      await mqttService.connect();
      // 将MQTT服务实例设置为全局变量，供API路由使用
      global.mqttServiceInstance = mqttService;
      logger.info('MQTT服务连接成功');
    } catch (mqttError) {
      logger.warn('MQTT服务连接失败，但服务器继续运行', { error: mqttError.message });
      // 即使连接失败，也设置全局变量，但标记为未连接状态
      global.mqttServiceInstance = mqttService;
    }
    
    // 启动定时任务调度器
    scheduler.start();
    schedulerService.start(); // 启动 schedulerService
    logger.info('定时任务调度器启动成功');
    
    // 初始化消息处理服务
    const messageProcessingService = new MessageProcessingService();
    await messageProcessingService.initialize();
    global.messageProcessingServiceInstance = messageProcessingService;
    logger.info('消息处理服务初始化成功');

    await alarmService.bootstrapOfflineAlarms();
    
    // 优雅关闭 - 统一信号处理
    const gracefulShutdown = async (signal) => {
      logger.info(`收到${signal}信号，正在关闭服务器...`);
      
      try {
        // 停止定时任务调度器
        schedulerService.stop();
        
        // 停止消息处理服务
        if (global.messageProcessingServiceInstance) {
          await global.messageProcessingServiceInstance.stop();
        }
        
        // 断开MQTT连接
        await mqttService.disconnect();
        
        // 关闭WebSocket服务
        websocketService.close();
        
        // 关闭数据库连接
        await sequelize.close();
        
        // 关闭HTTP服务器
        server.close(() => {
          logger.info('服务器已关闭');
          process.exit(0);
        });
        
        // 设置超时，防止无限等待
        setTimeout(() => {
          logger.error('强制关闭服务器');
          process.exit(1);
        }, 10000);
        
      } catch (error) {
        logger.error('关闭服务器时发生错误', { error: error.message, stack: error.stack });
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('服务器启动失败', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// 启动服务器
startServer();

module.exports = app;
