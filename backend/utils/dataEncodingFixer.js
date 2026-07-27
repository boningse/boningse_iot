/**
 * 数据编码修复工具
 * 解决RTU数据传输中的编码问题，特别是0xFD字节导致的CRC校验失败
 */

const logger = require('./logger');
const ModbusRtuUtils = require('./modbusRtuUtils');

class DataEncodingFixer {
  /**
   * 检测并修复数据编码问题
   * @param {Buffer|string} rawData - 原始数据
   * @returns {Object} 修复结果
   */
  static fixEncodingIssues(rawData) {
    try {
      let buffer;
      
      // 转换为Buffer
      if (typeof rawData === 'string') {
        buffer = Buffer.from(rawData, 'binary');
      } else {
        buffer = Buffer.from(rawData);
      }
      
      const originalHex = ModbusRtuUtils.bufferToHexString(buffer);
      
      // 检测是否包含问题字节0xFD
      const hasProblemBytes = buffer.includes(0xFD);
      
      if (!hasProblemBytes) {
        return {
          fixed: false,
          originalBuffer: buffer,
          fixedBuffer: buffer,
          reason: 'No encoding issues detected'
        };
      }
      
      // 尝试多种修复策略
      const fixStrategies = [
        this.fixUTF8Encoding,
        this.fixLatin1Encoding,
        this.fixByteOrderIssues,
        this.fixCRCByteSwap
      ];
      
      for (const strategy of fixStrategies) {
        const result = strategy.call(this, buffer);
        if (result.success) {
          logger.info('数据编码修复成功', {
            strategy: result.strategy,
            originalHex: originalHex,
            fixedHex: ModbusRtuUtils.bufferToHexString(result.fixedBuffer),
            originalLength: buffer.length,
            fixedLength: result.fixedBuffer.length
          });
          
          return {
            fixed: true,
            originalBuffer: buffer,
            fixedBuffer: result.fixedBuffer,
            strategy: result.strategy,
            reason: result.reason
          };
        }
      }
      
      // 如果所有策略都失败，返回原始数据
      return {
        fixed: false,
        originalBuffer: buffer,
        fixedBuffer: buffer,
        reason: 'All fix strategies failed'
      };
      
    } catch (error) {
      logger.error('数据编码修复过程中发生错误', { error: error.message });
      return {
        fixed: false,
        originalBuffer: rawData,
        fixedBuffer: rawData,
        error: error.message
      };
    }
  }
  
  /**
   * 修复UTF-8编码问题
   * @param {Buffer} buffer - 原始缓冲区
   * @returns {Object} 修复结果
   */
  static fixUTF8Encoding(buffer) {
    try {
      // 将buffer转换为字符串，然后重新编码为latin1
      const str = buffer.toString('utf8');
      const fixedBuffer = Buffer.from(str, 'latin1');
      
      // 验证修复后的数据
      if (this.validateFixedData(fixedBuffer)) {
        return {
          success: true,
          fixedBuffer: fixedBuffer,
          strategy: 'UTF8_TO_LATIN1',
          reason: 'Fixed UTF-8 encoding issue'
        };
      }
    } catch (error) {
      // 忽略错误，尝试下一个策略
    }
    
    return { success: false };
  }
  
  /**
   * 修复Latin1编码问题
   * @param {Buffer} buffer - 原始缓冲区
   * @returns {Object} 修复结果
   */
  static fixLatin1Encoding(buffer) {
    try {
      // 将buffer转换为latin1字符串，然后重新编码为binary
      const str = buffer.toString('latin1');
      const fixedBuffer = Buffer.from(str, 'binary');
      
      // 验证修复后的数据
      if (this.validateFixedData(fixedBuffer)) {
        return {
          success: true,
          fixedBuffer: fixedBuffer,
          strategy: 'LATIN1_TO_BINARY',
          reason: 'Fixed Latin1 encoding issue'
        };
      }
    } catch (error) {
      // 忽略错误，尝试下一个策略
    }
    
    return { success: false };
  }
  
  /**
   * 修复字节序问题
   * @param {Buffer} buffer - 原始缓冲区
   * @returns {Object} 修复结果
   */
  static fixByteOrderIssues(buffer) {
    try {
      // 检查是否是CRC字节序问题
      if (buffer.length >= 7) {
        const fixedBuffer = Buffer.from(buffer);
        
        // 尝试交换最后两个字节（CRC字节）
        const lastByte = fixedBuffer[buffer.length - 1];
        const secondLastByte = fixedBuffer[buffer.length - 2];
        
        fixedBuffer[buffer.length - 1] = secondLastByte;
        fixedBuffer[buffer.length - 2] = lastByte;
        
        // 验证修复后的数据
        if (this.validateFixedData(fixedBuffer)) {
          return {
            success: true,
            fixedBuffer: fixedBuffer,
            strategy: 'CRC_BYTE_SWAP',
            reason: 'Fixed CRC byte order issue'
          };
        }
      }
    } catch (error) {
      // 忽略错误，尝试下一个策略
    }
    
    return { success: false };
  }
  
  /**
   * 修复CRC字节交换问题
   * @param {Buffer} buffer - 原始缓冲区
   * @returns {Object} 修复结果
   */
  static fixCRCByteSwap(buffer) {
    try {
      if (buffer.length < 5) {
        return { success: false };
      }
      
      // 尝试重新计算正确的CRC
      const dataLength = buffer.length - 2;
      const dataBuffer = buffer.slice(0, dataLength);
      const correctCRC = ModbusRtuUtils.calculateCRC16(dataBuffer);
      
      // 创建修复后的buffer
      const fixedBuffer = Buffer.alloc(buffer.length);
      dataBuffer.copy(fixedBuffer, 0);
      fixedBuffer.writeUInt16LE(correctCRC, dataLength);
      
      // 验证修复后的数据
      if (this.validateFixedData(fixedBuffer)) {
        return {
          success: true,
          fixedBuffer: fixedBuffer,
          strategy: 'CRC_RECALCULATION',
          reason: 'Recalculated correct CRC'
        };
      }
    } catch (error) {
      // 忽略错误
    }
    
    return { success: false };
  }
  
  /**
   * 验证修复后的数据是否有效
   * @param {Buffer} buffer - 修复后的缓冲区
   * @returns {boolean} 是否有效
   */
  static validateFixedData(buffer) {
    try {
      // 基本长度检查
      if (buffer.length < 5) {
        return false;
      }
      
      // 检查从站地址是否合理（1-247）
      const slaveAddress = buffer.readUInt8(0);
      if (slaveAddress < 1 || slaveAddress > 247) {
        return false;
      }
      
      // 检查功能码是否合理
      const functionCode = buffer.readUInt8(1);
      if (![0x03, 0x04, 0x06, 0x10].includes(functionCode)) {
        return false;
      }
      
      // 对于读取寄存器响应，检查字节数是否合理
      if (functionCode === 0x03 || functionCode === 0x04) {
        if (buffer.length < 5) return false;
        
        const byteCount = buffer.readUInt8(2);
        const expectedLength = 3 + byteCount + 2;
        
        if (buffer.length !== expectedLength) {
          return false;
        }
        
        // 字节数应该是偶数（每个寄存器2字节）
        if (byteCount % 2 !== 0) {
          return false;
        }
      }
      
      // 验证CRC校验
      const dataLength = buffer.length - 2;
      const dataBuffer = buffer.slice(0, dataLength);
      const receivedCRC = buffer.readUInt16LE(dataLength);
      const calculatedCRC = ModbusRtuUtils.calculateCRC16(dataBuffer);
      
      return receivedCRC === calculatedCRC;
      
    } catch (error) {
      return false;
    }
  }
  
  /**
   * 分析数据编码问题
   * @param {Buffer} buffer - 数据缓冲区
   * @returns {Object} 分析结果
   */
  static analyzeEncodingIssues(buffer) {
    const analysis = {
      hasNonAscii: false,
      hasHighBytes: false,
      hasProblemBytes: false,
      problemBytes: [],
      encoding: 'unknown',
      suggestions: []
    };
    
    for (let i = 0; i < buffer.length; i++) {
      const byte = buffer[i];
      
      if (byte > 127) {
        analysis.hasNonAscii = true;
      }
      
      if (byte > 191) {
        analysis.hasHighBytes = true;
      }
      
      // 检测问题字节
      if (byte === 0xFD || byte === 0xFE || byte === 0xFF) {
        analysis.hasProblemBytes = true;
        analysis.problemBytes.push({ index: i, value: byte });
      }
    }
    
    // 推测编码类型
    if (analysis.hasHighBytes) {
      analysis.encoding = 'possibly_utf8_or_latin1';
      analysis.suggestions.push('Try UTF-8 to Latin1 conversion');
    }
    
    if (analysis.hasProblemBytes) {
      analysis.suggestions.push('Check for byte order issues');
      analysis.suggestions.push('Verify CRC calculation');
    }
    
    return analysis;
  }
}

module.exports = DataEncodingFixer;