
const Queue = require('bull');
const Redis = require('ioredis');

// Redis连接
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3
});

// 请求队列
const requestQueue = new Queue('request processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// 并发控制配置 - 优化版本
const CONCURRENCY_CONFIG = {
  maxConcurrentRequests: 200, // 增加并发处理能力
  queueTimeout: 60000,        // 增加队列超时时间
  processingTimeout: 120000,  // 增加处理超时时间
  priorityLevels: {
    CRITICAL: 0,  // 关键请求（认证、健康检查）
    HIGH: 1,      // 高优先级（用户操作）
    NORMAL: 5,    // 普通优先级（数据查询）
    LOW: 10       // 低优先级（批量操作）
  },
  // 新增配置
  adaptiveScaling: true,      // 启用自适应扩缩容
  healthCheckInterval: 5000,  // 健康检查间隔
  circuitBreakerThreshold: 0.8 // 熔断器阈值
};

// 并发控制器
class ConcurrencyController {
  constructor() {
    this.activeRequests = new Map();
    this.requestCount = 0;
    this.queuedRequests = 0;
  }
  
  // 获取请求优先级 - 优化版本
  getRequestPriority(req) {
    // 健康检查和系统状态请求 - 关键优先级
    if (req.path.includes('/health') || req.path.includes('/status')) {
      return CONCURRENCY_CONFIG.priorityLevels.CRITICAL;
    }
    
    // 认证请求 - 关键优先级（解决401错误问题）
    if (req.path.includes('/auth/')) {
      return CONCURRENCY_CONFIG.priorityLevels.CRITICAL;
    }
    
    // 用户操作请求 - 高优先级
    if (req.path.includes('/users/') || req.path.includes('/devices/')) {
      return CONCURRENCY_CONFIG.priorityLevels.HIGH;
    }
    
    // 数据查询请求 - 普通优先级
    if (req.method === 'GET') {
      return CONCURRENCY_CONFIG.priorityLevels.NORMAL;
    }
    
    // 批量操作和其他请求 - 低优先级
    if (req.path.includes('/batch') || req.path.includes('/bulk')) {
      return CONCURRENCY_CONFIG.priorityLevels.LOW;
    }
    
    // 默认普通优先级
    return CONCURRENCY_CONFIG.priorityLevels.NORMAL;
  }
  
  // 检查是否可以立即处理请求
  canProcessImmediately() {
    return this.requestCount < CONCURRENCY_CONFIG.maxConcurrentRequests;
  }
  
  // 添加请求到队列
  async queueRequest(req, res, next) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const priority = this.getRequestPriority(req);
    
    try {
      // 添加到队列
      const job = await requestQueue.add('processRequest', {
        requestId,
        method: req.method,
        path: req.path,
        timestamp: Date.now()
      }, {
        priority,
        delay: 0,
        timeout: CONCURRENCY_CONFIG.processingTimeout
      });
      
      this.queuedRequests++;
      
      // 等待处理完成
      const result = await job.finished();
      
      this.queuedRequests--;
      
      // 继续处理请求
      req.concurrencyInfo = {
        requestId,
        queueTime: result.queueTime,
        priority
      };
      
      next();
    } catch (error) {
      console.error('请求队列处理失败:', error);
      res.status(503).json({
        error: 'Service temporarily unavailable',
        message: 'Server is overloaded, please try again later'
      });
    }
  }
  
  // 开始处理请求
  startRequest(requestId) {
    this.activeRequests.set(requestId, {
      startTime: Date.now(),
      status: 'processing'
    });
    this.requestCount++;
  }
  
  // 完成请求处理
  finishRequest(requestId) {
    if (this.activeRequests.has(requestId)) {
      this.activeRequests.delete(requestId);
      this.requestCount--;
    }
  }
  
  // 获取统计信息
  getStats() {
    return {
      activeRequests: this.requestCount,
      queuedRequests: this.queuedRequests,
      maxConcurrentRequests: CONCURRENCY_CONFIG.maxConcurrentRequests,
      utilizationRate: (this.requestCount / CONCURRENCY_CONFIG.maxConcurrentRequests) * 100
    };
  }
}

// 全局并发控制器实例
const concurrencyController = new ConcurrencyController();

// 处理队列中的请求
requestQueue.process('processRequest', async (job) => {
  const { requestId } = job.data;
  const queueTime = Date.now() - job.data.timestamp;
  
  // 等待可用的处理槽位
  while (!concurrencyController.canProcessImmediately()) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return { requestId, queueTime };
});

// 并发控制中间件
const concurrencyControl = async (req, res, next) => {
  // 检查是否可以立即处理
  if (concurrencyController.canProcessImmediately()) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // 开始处理请求
    concurrencyController.startRequest(requestId);
    
    // 监听响应结束
    res.on('finish', () => {
      concurrencyController.finishRequest(requestId);
    });
    
    req.concurrencyInfo = {
      requestId,
      queueTime: 0,
      priority: concurrencyController.getRequestPriority(req)
    };
    
    next();
  } else {
    // 添加到队列
    await concurrencyController.queueRequest(req, res, next);
  }
};

// 并发统计API
const getConcurrencyStats = (req, res) => {
  try {
    const stats = concurrencyController.getStats();
    res.json({
      timestamp: new Date().toISOString(),
      concurrency: stats,
      queue: {
        waiting: requestQueue.waiting,
        active: requestQueue.active,
        completed: requestQueue.completed,
        failed: requestQueue.failed
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get concurrency stats',
      message: error.message
    });
  }
};

module.exports = {
  concurrencyControl,
  getConcurrencyStats,
  concurrencyController,
  requestQueue
};
