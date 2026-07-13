/**
 * 电表轮询配置
 * 统一管理电表数据采集的轮询间隔和相关参数
 */

module.exports = {
  // 轮询间隔配置（毫秒）
  pollingIntervals: {
    // 默认轮询间隔（10分钟）
    default: 10 * 60 * 1000,
    
    // 最小轮询间隔（1分钟）
    minimum: 1 * 60 * 1000,
    
    // 最大轮询间隔（60分钟）
    maximum: 60 * 60 * 1000,
    
    // 高频轮询间隔（用于重要设备，5分钟）
    highFrequency: 5 * 60 * 1000,
    
    // 低频轮询间隔（用于稳定设备，30分钟）
    lowFrequency: 30 * 60 * 1000
  },
  
  // 报文发送间隔配置（毫秒）
  commandIntervals: {
    // 报文间发送间隔（2秒）
    betweenCommands: 2000,
    
    // 电表间切换间隔（2秒）
    betweenMeters: 3000,
    
    // 设备间切换间隔（1秒）
    betweenDevices: 3000
  },
  
  // 动态轮询配置
  dynamicPolling: {
    // 是否启用动态轮询（根据设备状态调整间隔）
    enabled: false,
    
    // 连续错误阈值（超过此值降低轮询频率）
    errorThreshold: 3,
    
    // 连续成功阈值（超过此值可提高轮询频率）
    successThreshold: 5,
    
    // 错误时的轮询间隔倍数
    errorMultiplier: 2.0,
    
    // 成功时的轮询间隔倍数
    successMultiplier: 0.8
  },
  
  // 轮询策略配置
  pollingStrategy: {
    // 轮询模式：'fixed' - 固定间隔，'adaptive' - 自适应间隔
    mode: 'fixed',
    
    // 是否启用按类别分组轮询
    enableCategoryGrouping: true,
    
    // 是否使用RTU格式
    useRtuFormat: true,
    
    // 是否启用数据聚合
    enableDataAggregation: true
  },
  
  // 超时配置（毫秒）
  timeouts: {
    // 单个命令响应超时
    commandResponse: 5000,
    
    // 电表轮询总超时
    meterPolling: 30000,
    
    // 设备连接超时
    deviceConnection: 10000
  },
  
  // 重试配置
  retry: {
    // 最大重试次数
    maxAttempts: 3,
    
    // 重试间隔（毫秒）
    interval: 1000,
    
    // 重试间隔递增倍数
    backoffMultiplier: 1.5
  },
  
  // 日志配置
  logging: {
    // 是否记录轮询详细日志
    enableDetailedLogging: false,
    
    // 是否记录性能指标
    enablePerformanceLogging: true,
    
    // 日志级别：'debug', 'info', 'warn', 'error'
    logLevel: 'info'
  },
  
  // 性能优化配置
  performance: {
    // 最大并发轮询设备数
    maxConcurrentDevices: 10,
    
    // 设备轮询队列大小
    deviceQueueSize: 100,
    
    // 是否启用轮询缓存
    enablePollingCache: true,
    
    // 缓存过期时间（毫秒）
    cacheExpiration: 60000
  }
};