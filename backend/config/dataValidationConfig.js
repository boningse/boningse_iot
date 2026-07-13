/**
 * 数据验证配置文件
 * 允许用户根据实际情况调整验证参数
 */

module.exports = {
  // 数据质量阈值配置
  dataQuality: {
    // 最大填充字节比例（0xFF, 0x00等）
    maxFillByteRatio: process.env.DATA_VALIDATION_MAX_FILL_RATIO || 0.3,
    
    // 最大编码错误字节比例（0xFD等编码转换问题字节）
    maxEncodingErrorRatio: process.env.DATA_VALIDATION_MAX_ENCODING_ERROR_RATIO || 0.2,
    
    // 数据长度限制
    minValidDataLength: parseInt(process.env.DATA_VALIDATION_MIN_LENGTH) || 5,
    maxValidDataLength: parseInt(process.env.DATA_VALIDATION_MAX_LENGTH) || 255,
    
    // 有效从站地址范围
    validSlaveAddressRange: {
      min: parseInt(process.env.DATA_VALIDATION_MIN_SLAVE_ADDR) || 1,
      max: parseInt(process.env.DATA_VALIDATION_MAX_SLAVE_ADDR) || 247
    },
    
    // 支持的Modbus功能码
    validFunctionCodes: [
      0x01, // 读取线圈状态
      0x02, // 读取离散输入状态
      0x03, // 读取保持寄存器
      0x04, // 读取输入寄存器
      0x05, // 写单个线圈
      0x06, // 写单个寄存器
      0x0F, // 写多个线圈
      0x10  // 写多个寄存器
    ]
  },
  
  // 重试机制配置
  retryLogic: {
    // 最大可重试错误次数
    maxRetryableErrors: parseInt(process.env.DATA_VALIDATION_MAX_RETRIES) || 3,
    
    // 数据新鲜度窗口（毫秒）
    dataFreshnessWindow: parseInt(process.env.DATA_VALIDATION_FRESHNESS_WINDOW) || 30000,
    
    // 可重试的错误类型
    retryableErrorTypes: [
      'incomplete_data',
      'crc_failure',
      'exception_response',
      'length_mismatch'
    ],
    
    // 不可重试的错误类型（直接丢弃）
    nonRetryableErrorTypes: [
      'invalid_slave_address',
      'invalid_function_code',
      'corrupted_data',
      'duplicate_data'
    ]
  },
  
  // 数据去重配置
  deduplication: {
    // 缓存过期时间（毫秒）
    cacheExpiry: parseInt(process.env.DATA_VALIDATION_CACHE_EXPIRY) || 60000,
    
    // 最大缓存大小
    maxCacheSize: parseInt(process.env.DATA_VALIDATION_MAX_CACHE_SIZE) || 1000,
    
    // 是否启用数据去重
    enabled: process.env.DATA_VALIDATION_DEDUP_ENABLED !== 'false'
  },
  
  // 日志配置
  logging: {
    // 是否记录详细的验证日志
    enableDetailedLogging: process.env.DATA_VALIDATION_DETAILED_LOGGING === 'true',
    
    // 是否记录数据预览（用于调试）
    enableDataPreview: process.env.DATA_VALIDATION_DATA_PREVIEW !== 'false',
    
    // 数据预览最大长度
    dataPreviewMaxLength: parseInt(process.env.DATA_VALIDATION_PREVIEW_LENGTH) || 50,
    
    // 是否记录统计信息
    enableStats: process.env.DATA_VALIDATION_STATS !== 'false'
  },
  
  // 性能配置
  performance: {
    // 验证超时时间（毫秒）
    validationTimeout: parseInt(process.env.DATA_VALIDATION_TIMEOUT) || 5000,
    
    // 批量处理大小
    batchSize: parseInt(process.env.DATA_VALIDATION_BATCH_SIZE) || 100,
    
    // 统计清理间隔（毫秒）
    statsCleanupInterval: parseInt(process.env.DATA_VALIDATION_STATS_CLEANUP) || 300000
  },
  
  // 特殊设备配置
  deviceSpecific: {
    // 设备特定的验证规则
    customRules: {
      // 示例：特定厂商的设备可能有不同的数据格式
      // 'BNDBB': {
      //   maxFillByteRatio: 0.5,
      //   validFunctionCodes: [0x03, 0x04]
      // }
    },
    
    // 设备白名单（跳过验证）
    whitelist: process.env.DATA_VALIDATION_DEVICE_WHITELIST ? 
      process.env.DATA_VALIDATION_DEVICE_WHITELIST.split(',') : [],
    
    // 设备黑名单（强制丢弃）
    blacklist: process.env.DATA_VALIDATION_DEVICE_BLACKLIST ? 
      process.env.DATA_VALIDATION_DEVICE_BLACKLIST.split(',') : []
  },
  
  // 监控和告警配置
  monitoring: {
    // 错误率阈值（超过此比例触发告警）
    errorRateThreshold: parseFloat(process.env.DATA_VALIDATION_ERROR_RATE_THRESHOLD) || 0.1,
    
    // 监控窗口时间（毫秒）
    monitoringWindow: parseInt(process.env.DATA_VALIDATION_MONITORING_WINDOW) || 300000,
    
    // 是否启用告警
    enableAlerts: process.env.DATA_VALIDATION_ENABLE_ALERTS === 'true',
    
    // 告警冷却时间（毫秒）
    alertCooldown: parseInt(process.env.DATA_VALIDATION_ALERT_COOLDOWN) || 600000
  }
};

// 配置验证函数
function validateConfig(config) {
  const errors = [];
  
  // 验证数据质量配置
  if (config.dataQuality.maxFillByteRatio < 0 || config.dataQuality.maxFillByteRatio > 1) {
    errors.push('maxFillByteRatio must be between 0 and 1');
  }
  
  if (config.dataQuality.maxEncodingErrorRatio < 0 || config.dataQuality.maxEncodingErrorRatio > 1) {
    errors.push('maxEncodingErrorRatio must be between 0 and 1');
  }
  
  if (config.dataQuality.minValidDataLength < 1) {
    errors.push('minValidDataLength must be at least 1');
  }
  
  if (config.dataQuality.maxValidDataLength > 1024) {
    errors.push('maxValidDataLength should not exceed 1024');
  }
  
  // 验证重试配置
  if (config.retryLogic.maxRetryableErrors < 0) {
    errors.push('maxRetryableErrors must be non-negative');
  }
  
  if (config.retryLogic.dataFreshnessWindow < 1000) {
    errors.push('dataFreshnessWindow should be at least 1000ms');
  }
  
  return errors;
}

// 导出配置和验证函数
module.exports.validateConfig = validateConfig;

// 在模块加载时验证配置
const configErrors = validateConfig(module.exports);
if (configErrors.length > 0) {
  console.warn('数据验证配置警告:', configErrors);
}