/**
 * DTU网关配置
 */

module.exports = {
  // MQTT主题配置
  mqtt: {
    // DTU数据主题模式
    dataTopicPattern: 'zhhl/{manufacturer_code}/{imei}/publish',
    
    // DTU命令主题模式
    commandTopicPattern: 'zhhl/{manufacturer_code}/publish/{imei}',
    
    // 心跳主题模式
    heartbeatTopicPattern: 'zhhl/{manufacturer_code}/{imei}/heartbeat',
    
    // 状态主题模式
    statusTopicPattern: 'zhhl/{manufacturer_code}/{imei}/status'
  },
  
  // 设备状态配置
  device: {
    // 离线超时时间（秒）
    offlineTimeout: 300,
    
    // 心跳间隔（秒）
    heartbeatInterval: 60,
    
    // 数据采集间隔（秒）
    collectionInterval: 30,
    
    // 重连间隔（秒）
    reconnectInterval: 30
  },
  
  // Modbus配置
  modbus: {
    // 默认超时时间（毫秒）
    timeout: 5000,
    
    // 重试次数
    retryCount: 3,
    
    // 重试间隔（毫秒）
    retryInterval: 1000,
    
    // 支持的功能码
    supportedFunctionCodes: [1, 2, 3, 4, 5, 6, 15, 16]
  },
  
  // 数据处理配置
  dataProcessing: {
    // 数据缓存大小
    cacheSize: 1000,
    
    // 数据质量阈值
    qualityThreshold: 0.8,
    
    // 异常数据过滤
    enableAnomalyFilter: true,
    
    // 数据压缩
    enableCompression: false
  },
  
  // 日志配置
  logging: {
    // 日志级别
    level: 'info',
    
    // 是否记录原始数据
    logRawData: false,
    
    // 是否记录命令执行
    logCommands: true,
    
    // 日志文件路径
    logFile: 'logs/dtu-gateway.log'
  },
  
  // 性能配置
  performance: {
    // 最大并发连接数
    maxConcurrentConnections: 100,
    
    // 消息处理队列大小
    messageQueueSize: 1000,
    
    // 批处理大小
    batchSize: 50,
    
    // 批处理间隔（毫秒）
    batchInterval: 1000
  }
};