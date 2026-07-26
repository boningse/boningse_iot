const logger = require('../utils/logger');

/**
 * CORS配置选项
 */
const corsOptions = {
  // 允许的源
  origin: function (origin, callback) {
    // 允许的域名列表
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3002',
      'http://localhost:3003',
      'http://localhost:5173',
      'http://localhost:8080',
      'http://localhost:8081',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3003',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:8080',
      'http://mqtt.boningse.com',
      'https://mqtt.boningse.com',
      'https://mqttapi.boningse.com',
      'https://mqttapi.boningse.com',
      'https://v3-ldug.boningse.com'
    ];

    // 从环境变量获取额外的允许域名
    if (process.env.ALLOWED_ORIGINS) {
      const envOrigins = process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
      allowedOrigins.push(...envOrigins);
    }

    // 开发环境下允许所有源（包括没有Origin的请求，如Postman）
    if (process.env.NODE_ENV === 'development') {
      return callback(null, true);
    }

    // 生产环境下的检查
    if (process.env.NODE_ENV === 'production') {
      // 检查是否允许没有Origin头部的请求（通过环境变量控制）
      if (!origin) {
        if (process.env.ALLOW_NO_ORIGIN === 'true') {
          logger.info('CORS: 允许没有Origin头部的请求（已配置允许）');
          return callback(null, true);
        } else {
          logger.warn('CORS: 请求没有Origin头部', { origin });
          return callback(new Error('CORS策略不允许没有Origin的请求'));
        }
      }

      if (!allowedOrigins.includes(origin)) {
        logger.warn('CORS: 不允许的源', { origin, allowedOrigins });
        return callback(new Error(`CORS策略不允许来自 ${origin} 的请求`));
      }
    }

    // 检查是否在允许列表中
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS策略不允许此源'));
    }
  },

  // 允许的HTTP方法
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],

  // 允许的请求头
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key',
    'X-Tenant-ID',
    'X-Client-Type',
    'X-Request-ID',
    'Cache-Control',
    'Pragma'
  ],

  // 暴露的响应头
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count',
    'X-Current-Page',
    'X-Per-Page',
    'X-Request-ID',
    'X-Response-Time'
  ],

  // 是否允许发送Cookie
  credentials: true,

  // 预检请求的缓存时间（秒）
  maxAge: 86400, // 24小时

  // 是否通过预检请求
  preflightContinue: false,

  // 预检请求的状态码
  optionsSuccessStatus: 204
};

/**
 * 自定义CORS中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
const corsMiddleware = (req, res, next) => {
  const origin = req.headers.origin;
  const method = req.method;

  // 记录CORS请求
  logger.debug('CORS请求', {
    origin,
    method,
    path: req.path,
    headers: req.headers
  });

  // 处理预检请求
  if (method === 'OPTIONS') {
    logger.debug('处理CORS预检请求', { origin, path: req.path });

    // 检查源是否被允许
    corsOptions.origin(origin, (err, allowed) => {
      if (err) {
        logger.warn('CORS预检检查失败', { origin, error: err.message });
        return res.status(403).json({ error: 'CORS policy violation' });
      }

      if (allowed) {
        // 设置CORS头部
        res.header('Access-Control-Allow-Origin', origin || '*');
        res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
        res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
        res.header('Access-Control-Expose-Headers', corsOptions.exposedHeaders.join(', '));

        if (corsOptions.credentials) {
          res.header('Access-Control-Allow-Credentials', 'true');
        }

        res.header('Access-Control-Max-Age', corsOptions.maxAge.toString());
        res.header('Vary', 'Origin');

        // 设置内容类型选项
        res.header('X-Content-Type-Options', 'nosniff');

        // 设置缓存控制
        res.header('Cache-Control', 'no-cache, no-store, must-revalidate');

        logger.debug('CORS预检请求通过', { origin, path: req.path });
        return res.status(corsOptions.optionsSuccessStatus).end();
      } else {
        logger.warn('CORS预检请求被拒绝', { origin, path: req.path });
        return res.status(403).json({ error: 'CORS policy violation' });
      }
    });
    return;
  }

  // 设置CORS头部
  setCorsHeaders(req, res);

  next();
};

/**
 * 设置CORS响应头
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 */
const setCorsHeaders = (req, res) => {
  const origin = req.headers.origin;

  // 检查源是否被允许
  corsOptions.origin(origin, (err, allowed) => {
    if (err) {
      logger.warn('CORS检查失败', { origin, error: err.message });
      return;
    }

    if (allowed) {
      // 设置允许的源
      res.header('Access-Control-Allow-Origin', origin || '*');

      // 设置允许的方法
      res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));

      // 设置允许的头部
      res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));

      // 设置暴露的头部
      res.header('Access-Control-Expose-Headers', corsOptions.exposedHeaders.join(', '));

      // 设置是否允许凭证
      if (corsOptions.credentials) {
        res.header('Access-Control-Allow-Credentials', 'true');
      }

      // 设置预检缓存时间
      res.header('Access-Control-Max-Age', corsOptions.maxAge.toString());

      // 设置Vary头部以支持缓存
      res.header('Vary', 'Origin');

      // 设置内容类型选项
      res.header('X-Content-Type-Options', 'nosniff');

      // 设置缓存控制
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  });
};

/**
 * 安全头部中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
const securityHeaders = (req, res, next) => {
  // 防止点击劫持
  res.header('X-Frame-Options', 'DENY');

  // 防止MIME类型嗅探
  res.header('X-Content-Type-Options', 'nosniff');

  // 强制HTTPS（生产环境）
  if (process.env.NODE_ENV === 'production') {
    res.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }

  // 引用策略
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // 设置缓存控制
  res.header('Cache-Control', 'no-cache, no-store, must-revalidate');

  next();
};

/**
 * 请求ID中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
const requestId = (req, res, next) => {
  // 生成或使用现有的请求ID
  const requestId = req.headers['x-request-id'] ||
    req.headers['x-correlation-id'] ||
    generateRequestId();

  // 设置请求ID
  req.requestId = requestId;
  res.header('X-Request-ID', requestId);

  next();
};

/**
 * 生成请求ID
 * @returns {string} 请求ID
 */
const generateRequestId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 响应时间中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
const responseTime = (req, res, next) => {
  const startTime = Date.now();

  // 监听响应完成事件
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    res.header('X-Response-Time', `${duration}ms`);

    // 记录慢请求
    if (duration > 1000) {
      logger.warn('慢请求检测', {
        method: req.method,
        url: req.originalUrl,
        duration: `${duration}ms`,
        statusCode: res.statusCode,
        requestId: req.requestId
      });
    }
  });

  next();
};

module.exports = {
  corsOptions,
  corsMiddleware,
  securityHeaders,
  requestId,
  responseTime,
  setCorsHeaders
};
