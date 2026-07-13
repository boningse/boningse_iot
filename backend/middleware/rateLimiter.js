
const rateLimit = require('express-rate-limit');
const RedisStore = require('rate-limit-redis');
const Redis = require('ioredis');
const USE_REDIS = process.env.REDIS_ENABLED !== 'false';

// Redis客户端配置（在禁用Redis时不初始化）
const redis = USE_REDIS ? new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'iot:',
  lazyConnect: true
}) : null;

// 通用限流配置 - 使用Redis存储
const createRateLimiter = (options = {}) => {
  const base = {
    windowMs: options.windowMs || 60000,
    max: options.max || 1000,
    message: {
      error: 'Too many requests',
      retryAfter: Math.ceil(options.windowMs / 1000) || 60
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: (req) => {
      return req.ip + ':' + (req.user?.id || 'anonymous');
    },
    ...options
  };
  const store = USE_REDIS ? { store: new RedisStore({ sendCommand: (...args) => redis.call(...args) }) } : {};
  return rateLimit({ ...base, ...store });
};

// 不同类型的限流器
module.exports = {
  // 通用API限流
  generalLimiter: createRateLimiter(),
  
  // 认证API限流（调整为更合理的值）
  authLimiter: createRateLimiter({
    windowMs: 15 * 60 * 1000, // 15分钟
    max: 100, // 每15分钟最多100次登录尝试（区分正常用户和恶意请求）
    skipSuccessfulRequests: true,
    // 智能限流：根据IP和用户行为区分
    keyGenerator: (req) => {
      const baseKey = req.ip;
      // 如果是已认证用户，使用用户ID作为key的一部分
      if (req.user && req.user.id) {
        return `auth:user:${req.user.id}:${baseKey}`;
      }
      // 未认证用户使用IP
      return `auth:ip:${baseKey}`;
    }
  }),
  
  // 数据上传限流
  uploadLimiter: createRateLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 100, // 每分钟最多100次上传
    skipFailedRequests: true
  }),
  
  // 查询API限流（较宽松）
  queryLimiter: createRateLimiter({
    windowMs: 60 * 1000, // 1分钟
    max: 2000, // 每分钟最多2000次查询
    skipSuccessfulRequests: true
  })
};
