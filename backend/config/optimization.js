// 系统性能优化配置
const os = require('os');

// 获取系统信息
const getSystemInfo = () => {
  return {
    cpuCount: os.cpus().length,
    totalMemory: os.totalmem(),
    platform: os.platform(),
    arch: os.arch(),
  };
};

// 动态计算优化参数
const calculateOptimizedSettings = () => {
  const system = getSystemInfo();
  const memoryGB = Math.floor(system.totalMemory / (1024 * 1024 * 1024));
  
  return {
    // 数据库连接池优化
    database: {
      maxConnections: Math.min(system.cpuCount * 4, 50),
      minConnections: Math.max(Math.floor(system.cpuCount / 2), 2),
      acquireTimeout: 30000,
      idleTimeout: 10000,
    },
    
    // MQTT连接优化
    mqtt: {
      maxConnections: Math.min(system.cpuCount * 10, 100),
      keepAliveInterval: 60,
      reconnectPeriod: 5000,
      maxReconnectAttempts: 50,
      queueQoSZero: false,
    },
    
    // WebSocket优化
    websocket: {
      maxConnections: Math.min(system.cpuCount * 50, 1000),
      maxConnectionsPerTenant: Math.min(system.cpuCount * 10, 100),
      heartbeatInterval: 60000,
      maxPayload: 16 * 1024 * 1024, // 16MB
      perMessageDeflate: {
        threshold: 1024,
        concurrencyLimit: 10,
        memLevel: 7,
      },
    },
    
    // 缓存优化
    cache: {
      redis: {
        maxConnections: Math.min(system.cpuCount * 2, 20),
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        connectTimeout: 10000,
      },
      memory: {
        maxKeys: Math.min(memoryGB * 200, 2000),
        stdTTL: 600,
        checkPeriod: 120,
      },
    },
    
    // API限流优化
    rateLimit: {
      global: {
        windowMs: 60 * 1000, // 1分钟
        max: Math.min(system.cpuCount * 50, 200),
        skipSuccessfulRequests: true,
      },
      api: {
        windowMs: 60 * 1000,
        max: Math.min(system.cpuCount * 30, 120),
        skipSuccessfulRequests: true,
      },
    },
    
    // 进程优化
    process: {
      maxOldSpaceSize: Math.min(memoryGB * 512, 4096), // MB
      maxSemiSpaceSize: Math.min(memoryGB * 64, 256),  // MB
      gcInterval: 300000, // 5分钟
    },
  };
};

// 环境特定优化
const getEnvironmentOptimizations = () => {
  const env = process.env.NODE_ENV || 'development';
  const base = calculateOptimizedSettings();
  
  switch (env) {
    case 'production':
      return {
        ...base,
        database: {
          ...base.database,
          maxConnections: Math.max(base.database.maxConnections, 30),
          minConnections: Math.max(base.database.minConnections, 5),
        },
        mqtt: {
          ...base.mqtt,
          maxConnections: Math.max(base.mqtt.maxConnections, 80),
        },
        websocket: {
          ...base.websocket,
          maxConnections: Math.max(base.websocket.maxConnections, 800),
        },
        logging: {
          level: 'warn',
          enableDebug: false,
          enableBenchmark: false,
        },
      };
      
    case 'test':
      return {
        ...base,
        database: {
          ...base.database,
          maxConnections: 5,
          minConnections: 1,
        },
        mqtt: {
          ...base.mqtt,
          maxConnections: 10,
        },
        websocket: {
          ...base.websocket,
          maxConnections: 50,
        },
        logging: {
          level: 'error',
          enableDebug: false,
          enableBenchmark: false,
        },
      };
      
    default: // development
      return {
        ...base,
        logging: {
          level: 'debug',
          enableDebug: true,
          enableBenchmark: true,
        },
      };
  }
};

// 性能监控阈值
const getPerformanceThresholds = () => {
  const system = getSystemInfo();
  
  return {
    cpu: {
      warning: 70,
      critical: 85,
    },
    memory: {
      warning: 75,
      critical: 90,
    },
    responseTime: {
      warning: 1000,  // 1秒
      critical: 3000, // 3秒
    },
    errorRate: {
      warning: 2,   // 2%
      critical: 5,  // 5%
    },
    connections: {
      database: {
        warning: Math.floor(system.cpuCount * 3),
        critical: Math.floor(system.cpuCount * 4),
      },
      websocket: {
        warning: Math.floor(system.cpuCount * 40),
        critical: Math.floor(system.cpuCount * 50),
      },
    },
  };
};

// 数据库查询优化配置
const getDatabaseOptimizations = () => {
  return {
    // 查询超时
    queryTimeout: 30000,
    
    // 事务配置
    transaction: {
      isolationLevel: 'READ_COMMITTED',
      timeout: 60000,
    },
    
    // 索引优化建议
    indexOptimizations: [
      {
        table: 'device_data',
        indexes: [
          'device_id, timestamp DESC',
          'timestamp WHERE timestamp >= NOW() - INTERVAL \'30 days\'',
          'data_type, timestamp',
        ],
      },
      {
        table: 'devices',
        indexes: [
          'tenant_id, status',
          'imei',
          'last_seen_at',
        ],
      },
      {
        table: 'electric_meters',
        indexes: [
          'tenant_id, status',
          'dtu_device_id WHERE dtu_device_id IS NOT NULL',
          'meter_number',
        ],
      },
    ],
    
    // 分区建议
    partitioning: {
      device_data: {
        strategy: 'time_based',
        interval: 'monthly',
        retention: '12 months',
      },
      device_logs: {
        strategy: 'time_based',
        interval: 'weekly',
        retention: '3 months',
      },
    },
  };
};

// 缓存策略优化
const getCacheOptimizations = () => {
  return {
    strategies: {
      // 设备信息 - 长期缓存
      device: {
        ttl: 3600,
        useRedis: true,
        compression: true,
      },
      
      // 用户会话 - 中期缓存
      session: {
        ttl: 1800,
        useRedis: true,
        compression: false,
      },
      
      // API响应 - 短期缓存
      api: {
        ttl: 300,
        useRedis: false,
        compression: false,
      },
      
      // 设备数据 - 超短期缓存
      deviceData: {
        ttl: 60,
        useRedis: false,
        compression: false,
      },
      
      // 配置数据 - 长期缓存
      config: {
        ttl: 7200,
        useRedis: true,
        compression: true,
      },
    },
    
    // 缓存预热策略
    warmup: {
      enabled: true,
      strategies: [
        'device_configs',
        'user_sessions',
        'tenant_settings',
      ],
    },
    
    // 缓存清理策略
    cleanup: {
      interval: 300000, // 5分钟
      maxMemoryUsage: 0.8, // 80%
      evictionPolicy: 'lru',
    },
  };
};

// MQTT优化配置
const getMqttOptimizations = () => {
  return {
    // 连接优化
    connection: {
      keepAlive: 60,
      cleanSession: false,
      reconnectPeriod: 5000,
      connectTimeout: 30000,
    },
    
    // 消息处理优化
    messageProcessing: {
      batchSize: 100,
      batchTimeout: 1000,
      maxConcurrency: os.cpus().length * 2,
      retryAttempts: 3,
    },
    
    // 队列优化
    queue: {
      maxSize: 10000,
      highWaterMark: 8000,
      lowWaterMark: 2000,
    },
    
    // 主题优化
    topics: {
      maxSubscriptions: 1000,
      wildcardLimit: 100,
      qosDistribution: {
        0: 0.7, // 70% QoS 0
        1: 0.25, // 25% QoS 1
        2: 0.05, // 5% QoS 2
      },
    },
  };
};

// 应用所有优化
const applyOptimizations = () => {
  const optimizations = getEnvironmentOptimizations();
  
  // 设置Node.js进程优化
  if (optimizations.process) {
    process.env.NODE_OPTIONS = [
      `--max-old-space-size=${optimizations.process.maxOldSpaceSize}`,
      `--max-semi-space-size=${optimizations.process.maxSemiSpaceSize}`,
      '--optimize-for-size',
      '--gc-interval=' + optimizations.process.gcInterval,
    ].join(' ');
  }
  
  // 设置UV线程池大小
  process.env.UV_THREADPOOL_SIZE = Math.min(os.cpus().length * 2, 16).toString();
  
  console.log('Performance optimizations applied:', {
    environment: process.env.NODE_ENV,
    cpuCount: os.cpus().length,
    memoryGB: Math.floor(os.totalmem() / (1024 * 1024 * 1024)),
    uvThreadPoolSize: process.env.UV_THREADPOOL_SIZE,
    nodeOptions: process.env.NODE_OPTIONS,
  });
  
  return optimizations;
};

// 生成优化报告
const generateOptimizationReport = () => {
  const system = getSystemInfo();
  const optimizations = getEnvironmentOptimizations();
  const thresholds = getPerformanceThresholds();
  
  return {
    timestamp: new Date(),
    system,
    environment: process.env.NODE_ENV,
    optimizations,
    thresholds,
    recommendations: [
      {
        category: 'database',
        priority: 'high',
        description: '定期执行VACUUM和ANALYZE操作',
        command: 'VACUUM ANALYZE;',
      },
      {
        category: 'cache',
        priority: 'medium',
        description: '监控缓存命中率，目标 > 80%',
      },
      {
        category: 'monitoring',
        priority: 'high',
        description: '启用性能监控和警报系统',
      },
      {
        category: 'scaling',
        priority: 'medium',
        description: '考虑水平扩展当CPU使用率持续 > 70%',
      },
    ],
  };
};

module.exports = {
  getSystemInfo,
  calculateOptimizedSettings,
  getEnvironmentOptimizations,
  getPerformanceThresholds,
  getDatabaseOptimizations,
  getCacheOptimizations,
  getMqttOptimizations,
  applyOptimizations,
  generateOptimizationReport,
};