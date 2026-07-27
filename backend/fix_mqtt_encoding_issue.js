/**
 * 修复MQTT传输中的字符编码问题
 * 解决0xFD字节替换导致的CRC校验失败问题
 */

const ModbusRtuUtils = require('./utils/modbusRtuUtils');
const logger = require('./utils/logger');

class MqttEncodingFixer {
  /**
   * 分析并修复MQTT传输中的编码问题
   * @param {string} rawData - 从MQTT接收的原始数据
   * @returns {Object} 修复结果
   */
  static fixMqttEncodingIssue(rawData) {
    try {
      // 1. 分析原始数据
      console.log('\n=== MQTT编码问题分析 ===');
      console.log('原始数据长度:', rawData.length);
      console.log('原始数据类型:', typeof rawData);
      
      // 2. 转换为Buffer（当前系统的方法）
      const currentBuffer = this.convertUsingCurrentMethod(rawData);
      console.log('当前方法转换结果:', ModbusRtuUtils.bufferToHexString(currentBuffer));
      
      // 3. 尝试不同的转换方法
      const methods = [
        { name: 'latin1', method: this.convertUsingLatin1 },
        { name: 'binary', method: this.convertUsingBinary },
        { name: 'base64', method: this.convertUsingBase64 },
        { name: 'hex', method: this.convertUsingHex },
        { name: 'utf8_fixed', method: this.convertUsingUTF8Fixed }
      ];
      
      const results = [];
      
      for (const { name, method } of methods) {
        try {
          const buffer = method.call(this, rawData);
          const hexString = ModbusRtuUtils.bufferToHexString(buffer);
          
          // 检查是否包含0xFD字节
          const fdCount = buffer.filter(byte => byte === 0xFD).length;
          
          // 尝试解析RTU响应
          let parseResult = null;
          let crcValid = false;
          
          try {
            parseResult = ModbusRtuUtils.parseRTUResponse(buffer);
            crcValid = true;
          } catch (error) {
            // CRC校验失败，但记录错误信息
            parseResult = { error: error.message };
          }
          
          results.push({
            method: name,
            buffer,
            hexString,
            fdCount,
            crcValid,
            parseResult,
            length: buffer.length
          });
          
          console.log(`\n${name}方法:`);
          console.log('  Hex:', hexString);
          console.log('  0xFD字节数:', fdCount);
          console.log('  CRC有效:', crcValid);
          console.log('  长度:', buffer.length);
          
        } catch (error) {
          console.log(`\n${name}方法失败:`, error.message);
        }
      }
      
      // 4. 找到最佳方法
      const bestMethod = this.findBestMethod(results);
      
      if (bestMethod) {
        console.log('\n=== 推荐的修复方法 ===');
        console.log('方法:', bestMethod.method);
        console.log('Hex:', bestMethod.hexString);
        console.log('CRC有效:', bestMethod.crcValid);
        
        return {
          success: true,
          recommendedMethod: bestMethod.method,
          fixedBuffer: bestMethod.buffer,
          originalBuffer: currentBuffer,
          analysis: results
        };
      } else {
        return {
          success: false,
          error: '未找到有效的修复方法',
          analysis: results
        };
      }
      
    } catch (error) {
      console.error('修复过程中发生错误:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * 当前系统使用的转换方法
   */
  static convertUsingCurrentMethod(rawData) {
    const bytes = [];
    for (let i = 0; i < rawData.length; i++) {
      bytes.push(rawData.charCodeAt(i) & 0xFF);
    }
    return Buffer.from(bytes);
  }
  
  /**
   * 使用latin1编码转换
   */
  static convertUsingLatin1(rawData) {
    return Buffer.from(rawData, 'latin1');
  }
  
  /**
   * 使用binary编码转换
   */
  static convertUsingBinary(rawData) {
    return Buffer.from(rawData, 'binary');
  }
  
  /**
   * 使用base64编码转换（如果数据是base64编码的）
   */
  static convertUsingBase64(rawData) {
    // 检查是否可能是base64编码
    if (/^[A-Za-z0-9+/]*={0,2}$/.test(rawData)) {
      return Buffer.from(rawData, 'base64');
    }
    throw new Error('不是有效的base64数据');
  }
  
  /**
   * 使用hex编码转换（如果数据是十六进制字符串）
   */
  static convertUsingHex(rawData) {
    // 检查是否可能是十六进制字符串
    const cleanHex = rawData.replace(/\s+/g, '');
    if (/^[0-9A-Fa-f]*$/.test(cleanHex) && cleanHex.length % 2 === 0) {
      return Buffer.from(cleanHex, 'hex');
    }
    throw new Error('不是有效的十六进制数据');
  }
  
  /**
   * 修复UTF-8编码问题
   */
  static convertUsingUTF8Fixed(rawData) {
    // 尝试修复UTF-8编码导致的问题
    const buffer = Buffer.from(rawData, 'utf8');
    
    // 检查是否有UTF-8替换字符（0xFFFD）
    const utf8String = buffer.toString('utf8');
    if (utf8String.includes('\uFFFD')) {
      // 有替换字符，尝试其他方法
      throw new Error('包含UTF-8替换字符');
    }
    
    return buffer;
  }
  
  /**
   * 找到最佳的转换方法
   */
  static findBestMethod(results) {
    // 优先级：CRC有效 > 0xFD字节数少 > 长度合理
    const validResults = results.filter(r => r.buffer && r.buffer.length > 0);
    
    if (validResults.length === 0) {
      return null;
    }
    
    // 首先尝试找到CRC有效的结果
    const crcValidResults = validResults.filter(r => r.crcValid);
    if (crcValidResults.length > 0) {
      // 在CRC有效的结果中，选择0xFD字节数最少的
      return crcValidResults.reduce((best, current) => {
        if (current.fdCount < best.fdCount) {
          return current;
        }
        return best;
      });
    }
    
    // 如果没有CRC有效的结果，选择0xFD字节数最少的
    return validResults.reduce((best, current) => {
      if (current.fdCount < best.fdCount) {
        return current;
      }
      if (current.fdCount === best.fdCount && current.length > best.length) {
        return current;
      }
      return best;
    });
  }
  
  /**
   * 生成修复后的MQTT服务代码
   */
  static generateFixedCode(recommendedMethod) {
    const codeTemplates = {
      latin1: `
// 修复后的转换方法（使用latin1编码）
let buffer;
try {
  buffer = Buffer.from(rawData, 'latin1');
  logger.info('RTU响应数据转换为Buffer（latin1编码）', { 
    originalLength: rawData.length,
    bufferLength: buffer.length,
    hexString: ModbusRtuUtils.bufferToHexString(buffer)
  });
} catch (conversionError) {
  logger.error('RTU数据转换失败', { error: conversionError.message, rawData });
  return null;
}`,
      
      binary: `
// 修复后的转换方法（使用binary编码）
let buffer;
try {
  buffer = Buffer.from(rawData, 'binary');
  logger.info('RTU响应数据转换为Buffer（binary编码）', { 
    originalLength: rawData.length,
    bufferLength: buffer.length,
    hexString: ModbusRtuUtils.bufferToHexString(buffer)
  });
} catch (conversionError) {
  logger.error('RTU数据转换失败', { error: conversionError.message, rawData });
  return null;
}`
    };
    
    return codeTemplates[recommendedMethod] || '// 未找到对应的代码模板';
  }
}

// 测试函数
function testWithUserData() {
  console.log('=== 测试用户提到的响应数据 ===');
  
  // 模拟从MQTT接收到的损坏数据（包含0xFD字节）
  const corruptedData = '\x01\x03\x14\x00\x00\x5a\xfd\x00\x00\x5a\xfd\x00\x00\x5c\xfd\x00\x00\xfd\x4f\x00\x00\x9f\x21\xfd\xfd';
  
  // 正确的数据（用户客户端测试得到的）
  const correctHex = '0103 1400 005a cc00 005a d900 005c e600 009d 4f00 009f 21bd e0';
  const correctBuffer = ModbusRtuUtils.hexStringToBuffer(correctHex);
  
  console.log('正确数据:', ModbusRtuUtils.bufferToHexString(correctBuffer));
  
  // 分析修复方法
  const fixResult = MqttEncodingFixer.fixMqttEncodingIssue(corruptedData);
  
  if (fixResult.success) {
    console.log('\n=== 修复成功 ===');
    console.log('推荐方法:', fixResult.recommendedMethod);
    console.log('修复后代码:');
    console.log(MqttEncodingFixer.generateFixedCode(fixResult.recommendedMethod));
  } else {
    console.log('\n=== 修复失败 ===');
    console.log('错误:', fixResult.error);
  }
}

// 如果直接运行此文件，执行测试
if (require.main === module) {
  testWithUserData();
}

module.exports = MqttEncodingFixer;