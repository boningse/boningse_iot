// 缓存优化配置
const Redis = require('ioredis');
const NodeCache = require('node-cache');

// Redis 配置
const getRedisConfig = () => {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: process.env.REDIS_DB || 0,
    
    // 连接配置
    connectTimeout: 10000,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    
    // 连接池配置
    family: 4,
    keepAlive: true,
    
    // 重连配置
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    
    // 键前缀
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'iot:',
  };
};

// 内存缓存配置
const getMemoryCacheConfig = () => {
  return {
    // 标准TTL (秒)
    stdTTL: 600, // 10分钟
    
    // 检查周期
    checkperiod: 120, // 2分钟检查一次过期键
    
    // 错误时是否使用克隆
    useClones: false,
    
    // 删除未定义值
    deleteOnExpire: true,
    
    // 启用统计
    enableLegacyCallbacks: false,
    
    // 最大键数量
    maxKeys: 1000,
  };
};

// 缓存策略配置
const cacheStrategies = {
  // 设备信息缓存 - 长期缓存
  device: {
    ttl: 3600, // 1小时
    prefix: 'device:',
    useRedis: true,
  },
  
  // 用户会话缓存 - 中期缓存
  session: {
    ttl: 1800, // 30分钟
    prefix: 'session:',
    useRedis: true,
  },
  
  // API响应缓存 - 短期缓存
  api: {
    ttl: 300, // 5分钟
    prefix: 'api:',
    useRedis: false, // 使用内存缓存
  },
  
  // 设备数据缓存 - 超短期缓存
  deviceData: {
    ttl: 60, // 1分钟
    prefix: 'data:',
    useRedis: false,
  },
  
  // 配置缓存 - 长期缓存
  config: {
    ttl: 7200, // 2小时
    prefix: 'config:',
    useRedis: true,
  },
  
  // 统计数据缓存 - 中期缓存
  stats: {
    ttl: 900, // 15分钟
    prefix: 'stats:',
    useRedis: true,
  },
  
  // 电表数据缓存 - 短期缓存
  electricMeter: {
    ttl: 180, // 3分钟
    prefix: 'meter:',
    useRedis: false,
  },
};

// 缓存管理器类
class CacheManager {
  constructor() {
    this.redisClient = null;
    this.memoryCache = null;
    this.isRedisConnected = false;
    
    this.init();
  }
  
  async init() {
    try {
      // 初始化 Redis
      if (process.env.REDIS_ENABLED !== 'false') {
        this.redisClient = new Redis(getRedisConfig());
        
        this.redisClient.on('connect', () => {
          console.log('Redis connected successfully');
          this.isRedisConnected = true;
        });
        
        this.redisClient.on('ready', () => {
          console.log('Redis ready');
          this.isRedisConnected = true;
        });
        
        this.redisClient.on('error', (err) => {
          console.error('Redis connection error:', err);
          this.isRedisConnected = false;
        });
        
        this.redisClient.on('end', () => {
          console.log('Redis connection ended');
          this.isRedisConnected = false;
        });
        
        // ioredis 自动连接，无需手动调用 connect()
      }
      
      // 初始化内存缓存
      this.memoryCache = new NodeCache(getMemoryCacheConfig());
      
      // 监听内存缓存事件
      this.memoryCache.on('set', (key, value) => {
        console.log(`Memory cache set: ${key}`);
      });
      
      this.memoryCache.on('del', (key, value) => {
        console.log(`Memory cache deleted: ${key}`);
      });
      
      this.memoryCache.on('expired', (key, value) => {
        console.log(`Memory cache expired: ${key}`);
      });
      
    } catch (error) {
      console.error('Cache initialization error:', error);
    }
  }
  
  // 获取缓存
  async get(key, strategy = 'api') {
    const config = cacheStrategies[strategy];
    const fullKey = config.prefix + key;
    
    try {
      if (config.useRedis && this.isRedisConnected && this.redisClient) {
        const value = await this.redisClient.get(fullKey);
        return value ? JSON.parse(value) : null;
      } else {
        return this.memoryCache.get(fullKey);
      }
    } catch (error) {
      console.error(`Cache get error for key ${fullKey}:`, error);
      return null;
    }
  }
  
  // 设置缓存
  async set(key, value, strategy = 'api', customTTL = null) {
    const config = cacheStrategies[strategy];
    const fullKey = config.prefix + key;
    const ttl = customTTL || config.ttl;
    
    try {
      if (config.useRedis && this.isRedisConnected) {
        await this.redisClient.setEx(fullKey, ttl, JSON.stringify(value));
      } else {
        this.memoryCache.set(fullKey, value, ttl);
      }
      return true;
    } catch (error) {
      console.error(`Cache set error for key ${fullKey}:`, error);
      return false;
    }
  }
  
  // 删除缓存
  async del(key, strategy = 'api') {
    const config = cacheStrategies[strategy];
    const fullKey = config.prefix + key;
    
    try {
      if (config.useRedis && this.isRedisConnected) {
        await this.redisClient.del(fullKey);
      } else {
        this.memoryCache.del(fullKey);
      }
      return true;
    } catch (error) {
      console.error(`Cache delete error for key ${fullKey}:`, error);
      return false;
    }
  }
  
  // 批量删除缓存
  async delPattern(pattern, strategy = 'api') {
    const config = cacheStrategies[strategy];
    const fullPattern = config.prefix + pattern;
    
    try {
      if (config.useRedis && this.isRedisConnected) {
        const matched = [];
        let cursor = '0';
        do {
          const res = await this.redisClient.scan(cursor, 'MATCH', fullPattern, 'COUNT', 200);
          cursor = res[0];
          const batch = res[1];
          if (batch && batch.length) matched.push(...batch);
        } while (cursor !== '0');
        if (matched.length > 0) {
          await this.redisClient.del(matched);
        }
      } else {
        const keys = this.memoryCache.keys();
        const matchingKeys = keys.filter(key => key.includes(fullPattern));
        this.memoryCache.del(matchingKeys);
      }
      return true;
    } catch (error) {
      console.error(`Cache pattern delete error for pattern ${fullPattern}:`, error);
      return false;
    }
  }
  
  // 获取缓存统计
  getStats() {
    const memoryStats = this.memoryCache.getStats();
    
    return {
      redis: {
        connected: this.isRedisConnected,
        client: this.redisClient ? 'available' : 'unavailable',
      },
      memory: {
        keys: memoryStats.keys,
        hits: memoryStats.hits,
        misses: memoryStats.misses,
        ksize: memoryStats.ksize,
        vsize: memoryStats.vsize,
      },
    };
  }
  
  // 清空所有缓存
  async flush() {
    try {
      if (this.isRedisConnected && this.redisClient) {
        await this.redisClient.flushDb();
      }
      this.memoryCache.flushAll();
      console.log('All caches flushed successfully');
      return true;
    } catch (error) {
      console.error('Cache flush error:', error);
      return false;
    }
  }
  
  // 优雅关闭
  async close() {
    try {
      if (this.redisClient) {
        await this.redisClient.quit();
      }
      this.memoryCache.close();
      console.log('Cache connections closed successfully');
    } catch (error) {
      console.error('Cache close error:', error);
    }
  }
}

// 缓存中间件
const cacheMiddleware = (strategy = 'api', keyGenerator = null) => {
  return async (req, res, next) => {
    if (req.method !== 'GET') {
      return next();
    }
    
    const cacheKey = keyGenerator ? keyGenerator(req) : `${req.originalUrl || req.url}`;
    
    try {
      const cachedData = await cacheManager.get(cacheKey, strategy);
      
      if (cachedData) {
        res.setHeader('X-Cache', 'HIT');
        return res.json(cachedData);
      }
      
      // 重写 res.json 以缓存响应
      const originalJson = res.json;
      res.json = function(data) {
        res.setHeader('X-Cache', 'MISS');
        cacheManager.set(cacheKey, data, strategy);
        return originalJson.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

// 创建全局缓存管理器实例
const cacheManager = new CacheManager();

module.exports = {
  cacheManager,
  cacheMiddleware,
  cacheStrategies,
  getRedisConfig,
  getMemoryCacheConfig,
};

// === 性能优化配置 ===

// Redis连接优化
const redisOptimization = {
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableOfflineQueue: false,
  keyPrefix: 'iot:',
  
  // 连接池配置
  family: 4,
  keepAlive: true,
  
  // 重连策略
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    return err.message.includes(targetError);
  },
  
  // 性能监控
  enableAutoPipelining: true,
  maxRetriesPerRequest: 3
};

// 内存缓存优化
const memoryCacheOptimization = {
  max: 1000,
  ttl: 300000,
  
  // 启用统计
  updateAgeOnGet: true,
  updateAgeOnHas: true,
  
  // 内存管理
  allowStale: false,
  noDeleteOnFetchRejection: true
};

// 缓存预热策略
const cacheWarmupStrategies = {
  // 设备数据预热
  deviceData: {
    enabled: true,
    interval: 300000, // 5分钟
    batchSize: 100
  },
  
  // 用户会话预热
  userSessions: {
    enabled: true,
    interval: 600000, // 10分钟
    batchSize: 50
  },
  
  // 配置数据预热
  configData: {
    enabled: true,
    interval: 1800000, // 30分钟
    batchSize: 20
  }
};

// 导出优化配置
module.exports.optimization = {
  redis: redisOptimization,
  memory: memoryCacheOptimization,
  warmup: cacheWarmupStrategies
};
