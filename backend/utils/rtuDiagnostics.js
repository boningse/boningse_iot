/**
 * RTU通信诊断工具
 * 用于分析和修复RTU通信中的常见问题
 */

const ModbusRtuUtils = require('./modbusRtuUtils');
const logger = require('./logger');

class RtuDiagnostics {
  /**
   * 诊断RTU响应数据
   * @param {Buffer} buffer - RTU响应数据
   * @returns {Object} 诊断结果
   */
  static diagnoseRtuResponse(buffer) {
    const diagnosis = {
      originalBuffer: ModbusRtuUtils.bufferToHexString(buffer),
      bufferLength: buffer.length,
      issues: [],
      suggestions: [],
      parsedData: null,
      confidence: 0
    };

    try {
      // 基本长度检查
      if (buffer.length < 5) {
        diagnosis.issues.push('响应数据长度不足（最少需要5字节）');
        diagnosis.suggestions.push('检查设备连接和通信参数');
        return diagnosis;
      }

      const slaveAddress = buffer.readUInt8(0);
      const functionCode = buffer.readUInt8(1);
      
      diagnosis.slaveAddress = slaveAddress;
      diagnosis.functionCode = functionCode;

      // 检查从站地址合法性
      if (slaveAddress < 1 || slaveAddress > 247) {
        diagnosis.issues.push(`从站地址异常: ${slaveAddress} (应在1-247范围内)`);
        diagnosis.suggestions.push('检查设备地址配置');
      }

      // 检查功能码
      if (functionCode & 0x80) {
        diagnosis.issues.push('设备返回异常响应');
        if (buffer.length >= 3) {
          const exceptionCode = buffer.readUInt8(2);
          diagnosis.exceptionCode = exceptionCode;
          diagnosis.issues.push(`异常码: 0x${exceptionCode.toString(16).padStart(2, '0')}`);
        }
        return diagnosis;
      }

      // 针对读取寄存器响应的特殊处理
      if (functionCode === 0x03 || functionCode === 0x04) {
        return this.diagnoseReadRegistersResponse(buffer, diagnosis);
      }

      // 其他功能码的基本处理
      diagnosis.suggestions.push('功能码支持有限，建议使用读取寄存器功能码(03/04)');
      return diagnosis;

    } catch (error) {
      diagnosis.issues.push(`诊断过程出错: ${error.message}`);
      return diagnosis;
    }
  }

  /**
   * 诊断读取寄存器响应
   * @param {Buffer} buffer - RTU响应数据
   * @param {Object} diagnosis - 诊断对象
   * @returns {Object} 诊断结果
   */
  static diagnoseReadRegistersResponse(buffer, diagnosis) {
    const byteCount = buffer.readUInt8(2);
    diagnosis.byteCount = byteCount;

    // 计算预期长度
    const expectedLength = 3 + byteCount + 2;
    diagnosis.expectedLength = expectedLength;

    // 检查长度匹配
    if (buffer.length < expectedLength) {
      diagnosis.issues.push(`响应数据不完整，预期${expectedLength}字节，实际${buffer.length}字节`);
      diagnosis.suggestions.push('检查通信超时设置和网络稳定性');
      diagnosis.confidence = 0;
      return diagnosis;
    }

    // 检查是否有额外字节
    let processedBuffer = buffer;
    if (buffer.length > expectedLength) {
      const extraBytes = buffer.slice(expectedLength);
      diagnosis.issues.push(`检测到${extraBytes.length}个额外字节: ${ModbusRtuUtils.bufferToHexString(extraBytes)}`);
      diagnosis.suggestions.push('可能存在通信干扰或设备固件问题，尝试截断额外字节');
      processedBuffer = buffer.slice(0, expectedLength);
      diagnosis.processedBuffer = ModbusRtuUtils.bufferToHexString(processedBuffer);
    }

    // CRC校验
    const dataLength = processedBuffer.length - 2;
    const dataBuffer = processedBuffer.slice(0, dataLength);
    const receivedCRC = processedBuffer.readUInt16LE(dataLength);
    const calculatedCRC = ModbusRtuUtils.calculateCRC16(dataBuffer);

    diagnosis.crcCheck = {
      received: `0x${receivedCRC.toString(16).padStart(4, '0')}`,
      calculated: `0x${calculatedCRC.toString(16).padStart(4, '0')}`,
      passed: receivedCRC === calculatedCRC
    };

    if (!diagnosis.crcCheck.passed) {
      diagnosis.issues.push('CRC校验失败');
      diagnosis.suggestions.push('可能存在通信干扰，建议检查线路和屏蔽');
      
      // 尝试数据恢复
      const recoveryResult = this.attemptDataRecovery(processedBuffer);
      if (recoveryResult.success) {
        diagnosis.suggestions.push('已尝试数据恢复，可忽略CRC继续使用数据');
        diagnosis.parsedData = recoveryResult.data;
        diagnosis.confidence = 0.7; // 中等置信度
      } else {
        diagnosis.confidence = 0.3; // 低置信度
      }
    } else {
      // CRC校验通过，解析数据
      try {
        const registerCount = byteCount / 2;
        const registers = [];
        
        for (let i = 0; i < registerCount; i++) {
          registers.push(processedBuffer.readUInt16BE(3 + i * 2));
        }
        
        diagnosis.parsedData = {
          byteCount,
          registerCount,
          registers
        };
        diagnosis.confidence = 1.0; // 高置信度
      } catch (parseError) {
        diagnosis.issues.push(`数据解析失败: ${parseError.message}`);
        diagnosis.confidence = 0.2;
      }
    }

    return diagnosis;
  }

  /**
   * 尝试数据恢复
   * @param {Buffer} buffer - 处理后的buffer
   * @returns {Object} 恢复结果
   */
  static attemptDataRecovery(buffer) {
    try {
      const slaveAddress = buffer.readUInt8(0);
      const functionCode = buffer.readUInt8(1);
      const byteCount = buffer.readUInt8(2);
      
      // 基本合理性检查
      if (byteCount % 2 !== 0) {
        return { success: false, reason: '字节数不是偶数，无法构成完整寄存器' };
      }
      
      if (byteCount > 250) {
        return { success: false, reason: '字节数过大，可能数据损坏' };
      }
      
      const registerCount = byteCount / 2;
      const registers = [];
      
      // 检查是否有足够的数据字节
      if (buffer.length < 3 + byteCount) {
        return { success: false, reason: '数据字节不足' };
      }
      
      for (let i = 0; i < registerCount; i++) {
        registers.push(buffer.readUInt16BE(3 + i * 2));
      }
      
      return {
        success: true,
        data: {
          slaveAddress,
          functionCode,
          byteCount,
          registerCount,
          registers
        }
      };
    } catch (error) {
      return { success: false, reason: error.message };
    }
  }

  /**
   * 生成修复建议
   * @param {Object} diagnosis - 诊断结果
   * @returns {Array} 修复建议列表
   */
  static generateFixSuggestions(diagnosis) {
    const suggestions = [...diagnosis.suggestions];
    
    if (diagnosis.issues.length === 0) {
      suggestions.push('✅ 响应数据正常，无需修复');
      return suggestions;
    }
    
    // 根据置信度给出建议
    if (diagnosis.confidence >= 0.7) {
      suggestions.push('🔧 建议：忽略CRC错误，使用解析出的数据');
      suggestions.push('📊 数据质量：良好，可以继续使用');
    } else if (diagnosis.confidence >= 0.3) {
      suggestions.push('⚠️ 建议：数据可能有问题，建议重新查询');
      suggestions.push('🔍 排查：检查通信参数和设备状态');
    } else {
      suggestions.push('❌ 建议：数据不可靠，必须重新查询');
      suggestions.push('🚨 紧急：检查设备连接和通信线路');
    }
    
    return suggestions;
  }

  /**
   * 生成诊断报告
   * @param {Buffer} buffer - RTU响应数据
   * @returns {string} 诊断报告
   */
  static generateDiagnosticReport(buffer) {
    const diagnosis = this.diagnoseRtuResponse(buffer);
    const suggestions = this.generateFixSuggestions(diagnosis);
    
    let report = '\n=== RTU响应诊断报告 ===\n';
    report += `原始数据: ${diagnosis.originalBuffer}\n`;
    report += `数据长度: ${diagnosis.bufferLength} 字节\n`;
    
    if (diagnosis.slaveAddress !== undefined) {
      report += `从站地址: ${diagnosis.slaveAddress}\n`;
    }
    
    if (diagnosis.functionCode !== undefined) {
      report += `功能码: 0x${diagnosis.functionCode.toString(16).padStart(2, '0')}\n`;
    }
    
    if (diagnosis.expectedLength !== undefined) {
      report += `预期长度: ${diagnosis.expectedLength} 字节\n`;
    }
    
    if (diagnosis.processedBuffer) {
      report += `处理后数据: ${diagnosis.processedBuffer}\n`;
    }
    
    if (diagnosis.crcCheck) {
      report += `\nCRC校验:\n`;
      report += `  接收: ${diagnosis.crcCheck.received}\n`;
      report += `  计算: ${diagnosis.crcCheck.calculated}\n`;
      report += `  结果: ${diagnosis.crcCheck.passed ? '✅ 通过' : '❌ 失败'}\n`;
    }
    
    if (diagnosis.parsedData) {
      report += `\n解析数据:\n`;
      report += `  字节数: ${diagnosis.parsedData.byteCount}\n`;
      report += `  寄存器数: ${diagnosis.parsedData.registerCount}\n`;
      report += `  寄存器值: [${diagnosis.parsedData.registers.join(', ')}]\n`;
    }
    
    report += `\n数据置信度: ${(diagnosis.confidence * 100).toFixed(1)}%\n`;
    
    if (diagnosis.issues.length > 0) {
      report += `\n发现问题:\n`;
      diagnosis.issues.forEach((issue, index) => {
        report += `  ${index + 1}. ${issue}\n`;
      });
    }
    
    if (suggestions.length > 0) {
      report += `\n修复建议:\n`;
      suggestions.forEach((suggestion, index) => {
        report += `  ${index + 1}. ${suggestion}\n`;
      });
    }
    
    report += '\n========================\n';
    
    return report;
  }
}

module.exports = RtuDiagnostics;