/**
 * 数据验证和过滤工具
 * 用于验证和过滤MQTT消息中的异常数据
 */

const logger = require('./logger');

class DataValidator {
  constructor() {
    // 数据质量阈值
    this.thresholds = {
      maxFillByteRatio: 0.3,        // 最大填充字节比例（0xFF, 0x00）
      maxEncodingErrorRatio: 0.2,   // 最大编码错误字节比例（0xFD）
      minValidDataLength: 5,        // 最小有效数据长度
      maxValidDataLength: 255,      // 最大有效数据长度
      validSlaveAddressRange: [1, 247], // 有效从站地址范围
      validFunctionCodes: [0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x0F, 0x10], // 有效功能码
      maxRetryableErrors: 3,        // 最大可重试错误次数
      dataFreshnessWindow: 30000    // 数据新鲜度窗口（30秒）
    };
    
    // 错误统计
    this.errorStats = new Map();
    
    // 数据去重缓存
    this.dataCache = new Map();
    this.cacheExpiry = 60000; // 1分钟缓存过期
  }

  /**
   * 验证MQTT消息数据
   * @param {Buffer|string} data - 原始数据
   * @param {string} topic - MQTT主题
   * @param {string} deviceId - 设备ID
   * @returns {Object} 验证结果
   */
  validateMqttData(data, topic, deviceId) {
    const result = {
      isValid: true,
      shouldRetry: false,
      shouldDiscard: false,
      errors: [],
      warnings: [],
      dataQuality: 'good', // good, poor, corrupted
      processedData: data
    };

    try {
      // 1. 基本数据检查
      if (!data || (Buffer.isBuffer(data) && data.length === 0) || (typeof data === 'string' && data.length === 0)) {
        result.isValid = false;
        result.shouldDiscard = true;
        result.errors.push('数据为空');
        return result;
      }

      // 2. 数据去重检查
      const dataHash = this.generateDataHash(data, topic, deviceId);
      if (this.isDuplicateData(dataHash)) {
        result.isValid = false;
        result.shouldDiscard = true;
        result.errors.push('重复数据');
        return result;
      }

      // 3. 数据长度检查
      const dataLength = Buffer.isBuffer(data) ? data.length : Buffer.from(data, 'hex').length;
      if (dataLength < this.thresholds.minValidDataLength || dataLength > this.thresholds.maxValidDataLength) {
        result.isValid = false;
        result.shouldDiscard = true;
        result.errors.push(`数据长度异常: ${dataLength} 字节`);
        return result;
      }

      // 4. 如果是16进制字符串，验证格式
      if (typeof data === 'string') {
        const hexValidation = this.validateHexString(data);
        if (!hexValidation.isValid) {
          result.isValid = false;
          result.shouldDiscard = true;
          result.errors.push(...hexValidation.errors);
          return result;
        }
        result.processedData = hexValidation.cleanedData;
      }

      // 5. 二进制数据质量检查
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(result.processedData, 'hex');
      const qualityCheck = this.checkDataQuality(buffer);
      result.dataQuality = qualityCheck.quality;
      result.warnings.push(...qualityCheck.warnings);

      // 6. 如果数据质量太差，标记为应丢弃
      if (qualityCheck.quality === 'corrupted') {
        result.isValid = false;
        result.shouldDiscard = true;
        result.errors.push('数据严重损坏');
        return result;
      }

      // 7. Modbus RTU特定验证
      if (topic.includes('/publish')) {
        const modbusValidation = this.validateModbusRtuData(buffer);
        if (!modbusValidation.isValid) {
          // 根据错误类型决定是否重试
          if (modbusValidation.isRetryable) {
            result.shouldRetry = this.shouldRetryError(deviceId, modbusValidation.errorType);
          } else {
            result.shouldDiscard = true;
          }
          result.isValid = false;
          result.errors.push(...modbusValidation.errors);
        }
      }

      // 8. 记录数据到缓存（用于去重）
      this.cacheData(dataHash);

    } catch (error) {
      result.isValid = false;
      result.shouldDiscard = true;
      result.errors.push(`验证过程异常: ${error.message}`);
    }

    return result;
  }

  /**
   * 验证16进制字符串格式
   * @param {string} hexString - 16进制字符串
   * @returns {Object} 验证结果
   */
  validateHexString(hexString) {
    const result = {
      isValid: true,
      errors: [],
      cleanedData: hexString
    };

    try {
      // 移除空格、冒号、短横线等分隔符
      const cleaned = hexString.replace(/[\s\-:]/g, '');
      
      // 检查是否为有效的16进制字符
      if (!/^[0-9A-Fa-f]*$/.test(cleaned)) {
        result.isValid = false;
        result.errors.push('包含非16进制字符');
        return result;
      }

      // 检查长度是否为偶数（每个字节需要2个16进制字符）
      if (cleaned.length % 2 !== 0) {
        result.isValid = false;
        result.errors.push('16进制字符串长度必须为偶数');
        return result;
      }

      result.cleanedData = cleaned;
    } catch (error) {
      result.isValid = false;
      result.errors.push(`16进制字符串验证异常: ${error.message}`);
    }

    return result;
  }

  /**
   * 检查数据质量
   * @param {Buffer} buffer - 数据缓冲区
   * @returns {Object} 质量检查结果
   */
  checkDataQuality(buffer) {
    const result = {
      quality: 'good',
      warnings: [],
      fillByteRatio: 0,
      encodingErrorRatio: 0
    };

    let fillByteCount = 0;
    let encodingErrorCount = 0;

    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      
      // 统计填充字节（0xFF, 0x00）
      if (byte === 0xFF || byte === 0x00) {
        fillByteCount++;
      }
      
      // 统计编码错误字节（0xFD通常表示编码转换问题）
      if (byte === 0xFD) {
        encodingErrorCount++;
      }
    }

    result.fillByteRatio = fillByteCount / buffer.length;
    result.encodingErrorRatio = encodingErrorCount / buffer.length;

    // 判断数据质量
    if (result.fillByteRatio > this.thresholds.maxFillByteRatio) {
      result.quality = 'corrupted';
      result.warnings.push(`填充字节比例过高: ${(result.fillByteRatio * 100).toFixed(1)}%`);
    } else if (result.encodingErrorRatio > this.thresholds.maxEncodingErrorRatio) {
      result.quality = 'poor';
      result.warnings.push(`编码错误字节比例过高: ${(result.encodingErrorRatio * 100).toFixed(1)}%`);
    } else if (result.fillByteRatio > 0.1 || result.encodingErrorRatio > 0) {
      result.quality = 'poor';
      if (result.fillByteRatio > 0.1) {
        result.warnings.push(`检测到填充字节: ${(result.fillByteRatio * 100).toFixed(1)}%`);
      }
      if (result.encodingErrorRatio > 0) {
        result.warnings.push(`检测到编码错误字节: ${encodingErrorCount} 个`);
      }
    }

    return result;
  }

  /**
   * 验证Modbus RTU数据
   * @param {Buffer} buffer - RTU数据缓冲区
   * @returns {Object} 验证结果
   */
  validateModbusRtuData(buffer) {
    const result = {
      isValid: true,
      isRetryable: false,
      errorType: null,
      errors: []
    };

    if (buffer.length < 5) {
      result.isValid = false;
      result.isRetryable = true;
      result.errorType = 'incomplete_data';
      result.errors.push('RTU数据长度不足');
      return result;
    }

    const slaveAddress = buffer[0];
    const functionCode = buffer[1];

    // 验证从站地址
    if (slaveAddress < this.thresholds.validSlaveAddressRange[0] || 
        slaveAddress > this.thresholds.validSlaveAddressRange[1]) {
      result.isValid = false;
      result.isRetryable = false;
      result.errorType = 'invalid_slave_address';
      result.errors.push(`无效的从站地址: ${slaveAddress}`);
      return result;
    }

    // 验证功能码
    if (!this.thresholds.validFunctionCodes.includes(functionCode & 0x7F)) {
      result.isValid = false;
      result.isRetryable = false;
      result.errorType = 'invalid_function_code';
      result.errors.push(`无效的功能码: 0x${functionCode.toString(16).padStart(2, '0')}`);
      return result;
    }

    // 检查异常响应
    if (functionCode & 0x80) {
      result.isValid = false;
      result.isRetryable = true;
      result.errorType = 'exception_response';
      const exceptionCode = buffer.length > 2 ? buffer[2] : 0;
      result.errors.push(`Modbus异常响应: 0x${exceptionCode.toString(16).padStart(2, '0')}`);
      return result;
    }

    // 对于读取功能码，验证数据长度字段
    if ((functionCode === 0x03 || functionCode === 0x04) && buffer.length >= 5) {
      const dataLength = buffer[2];
      const expectedLength = 3 + dataLength + 2; // 从站地址 + 功能码 + 数据长度 + 数据 + CRC
      
      if (buffer.length !== expectedLength) {
        result.isValid = false;
        result.isRetryable = true;
        result.errorType = 'length_mismatch';
        result.errors.push(`数据长度不匹配: 期望${expectedLength}字节，实际${buffer.length}字节`);
        return result;
      }
    }

    return result;
  }

  /**
   * 生成数据哈希（用于去重）
   * @param {Buffer|string} data - 数据
   * @param {string} topic - 主题
   * @param {string} deviceId - 设备ID
   * @returns {string} 数据哈希
   */
  generateDataHash(data, topic, deviceId) {
    const crypto = require('crypto');
    const dataStr = Buffer.isBuffer(data) ? data.toString('hex') : data;
    const hashInput = `${deviceId}:${topic}:${dataStr}`;
    return crypto.createHash('md5').update(hashInput).digest('hex');
  }

  /**
   * 检查是否为重复数据
   * @param {string} dataHash - 数据哈希
   * @returns {boolean} 是否重复
   */
  isDuplicateData(dataHash) {
    const now = Date.now();
    
    // 清理过期缓存
    for (const [hash, timestamp] of this.dataCache.entries()) {
      if (now - timestamp > this.cacheExpiry) {
        this.dataCache.delete(hash);
      }
    }
    
    return this.dataCache.has(dataHash);
  }

  /**
   * 缓存数据哈希
   * @param {string} dataHash - 数据哈希
   */
  cacheData(dataHash) {
    this.dataCache.set(dataHash, Date.now());
  }

  /**
   * 判断是否应该重试错误
   * @param {string} deviceId - 设备ID
   * @param {string} errorType - 错误类型
   * @returns {boolean} 是否应该重试
   */
  shouldRetryError(deviceId, errorType) {
    const key = `${deviceId}:${errorType}`;
    const now = Date.now();
    
    if (!this.errorStats.has(key)) {
      this.errorStats.set(key, { count: 1, firstSeen: now, lastSeen: now });
      return true;
    }
    
    const stats = this.errorStats.get(key);
    stats.count++;
    stats.lastSeen = now;
    
    // 如果错误次数超过阈值，不再重试
    if (stats.count > this.thresholds.maxRetryableErrors) {
      return false;
    }
    
    // 如果错误持续时间过长，不再重试
    if (now - stats.firstSeen > this.dataFreshnessWindow) {
      return false;
    }
    
    return true;
  }

  /**
   * 清理统计数据
   */
  cleanupStats() {
    const now = Date.now();
    for (const [key, stats] of this.errorStats.entries()) {
      if (now - stats.lastSeen > this.dataFreshnessWindow * 2) {
        this.errorStats.delete(key);
      }
    }
  }

  /**
   * 获取数据验证统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      errorStats: Object.fromEntries(this.errorStats),
      cacheSize: this.dataCache.size,
      thresholds: this.thresholds
    };
  }
}

module.exports = new DataValidator();