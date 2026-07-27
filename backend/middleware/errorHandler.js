const logger = require('../utils/logger');

/**
 * 全局错误处理中间件
 * @param {Error} err - 错误对象
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // 记录错误日志
  logger.error('错误处理中间件捕获到错误', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
    tenantId: req.user?.tenant_id
  });

  // 默认错误响应
  let statusCode = 500;
  let message = '服务器内部错误';
  let details = null;

  // 根据错误类型设置响应
  if (err.name === 'ValidationError') {
    // 验证错误
    statusCode = 400;
    message = '数据验证失败';
    details = Object.values(err.errors).map(val => val.message);
  } else if (err.name === 'CastError') {
    // 类型转换错误
    statusCode = 400;
    message = '无效的资源ID';
  } else if (err.code === 11000) {
    // MongoDB重复键错误
    statusCode = 400;
    message = '数据重复';
    const field = Object.keys(err.keyValue)[0];
    details = `${field}已存在`;
  } else if (err.name === 'JsonWebTokenError') {
    // JWT错误
    statusCode = 401;
    message = '无效的访问令牌';
  } else if (err.name === 'TokenExpiredError') {
    // JWT过期错误
    statusCode = 401;
    message = '访问令牌已过期';
  } else if (err.name === 'SequelizeValidationError') {
    // Sequelize验证错误
    statusCode = 400;
    message = '数据验证失败';
    details = err.errors.map(e => e.message);
  } else if (err.name === 'SequelizeUniqueConstraintError') {
    // Sequelize唯一约束错误
    statusCode = 400;
    message = '数据重复';
    details = err.errors.map(e => `${e.path}已存在`);
  } else if (err.name === 'SequelizeForeignKeyConstraintError') {
    // Sequelize外键约束错误
    statusCode = 400;
    message = '关联数据不存在';
  } else if (err.name === 'SequelizeConnectionError') {
    // Sequelize连接错误
    statusCode = 503;
    message = '数据库连接失败';
  } else if (err.statusCode) {
    // 自定义状态码错误
    statusCode = err.statusCode;
    message = err.message;
  }

  // 开发环境下返回详细错误信息
  const response = {
    success: false,
    message,
    ...(details && { details }),
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      error: err
    })
  };

  res.status(statusCode).json(response);
};

/**
 * 404错误处理中间件
 * @param {Object} req - 请求对象
 * @param {Object} res - 响应对象
 * @param {Function} next - 下一个中间件函数
 */
const notFoundHandler = (req, res, next) => {
  logger.warn('404错误 - 资源未找到', {
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id
  });

  const error = new Error(`资源未找到 - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * 异步错误捕获包装器
 * @param {Function} fn - 异步函数
 * @returns {Function} 包装后的函数
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 创建自定义错误类
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 验证错误类
 */
class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400);
    this.name = 'ValidationError';
    this.details = details;
  }
}

/**
 * 认证错误类
 */
class AuthenticationError extends AppError {
  constructor(message = '认证失败') {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

/**
 * 授权错误类
 */
class AuthorizationError extends AppError {
  constructor(message = '权限不足') {
    super(message, 403);
    this.name = 'AuthorizationError';
  }
}

/**
 * 资源未找到错误类
 */
class NotFoundError extends AppError {
  constructor(message = '资源未找到') {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

/**
 * 冲突错误类
 */
class ConflictError extends AppError {
  constructor(message = '资源冲突') {
    super(message, 409);
    this.name = 'ConflictError';
  }
}

/**
 * 速率限制错误类
 */
class RateLimitError extends AppError {
  constructor(message = '请求过于频繁') {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}

/**
 * 服务不可用错误类
 */
class ServiceUnavailableError extends AppError {
  constructor(message = '服务暂时不可用') {
    super(message, 503);
    this.name = 'ServiceUnavailableError';
  }
}

/**
 * 处理未捕获的Promise拒绝
 */
process.on('unhandledRejection', (err, promise) => {
  logger.error('未处理的Promise拒绝', {
    error: err.message,
    stack: err.stack,
    promise
  });
  
  // 优雅关闭服务器
  process.exit(1);
});

/**
 * 处理未捕获的异常
 */
process.on('uncaughtException', (err) => {
  logger.error('未捕获的异常', {
    error: err.message,
    stack: err.stack
  });
  
  // 优雅关闭服务器
  process.exit(1);
});

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceUnavailableError
};