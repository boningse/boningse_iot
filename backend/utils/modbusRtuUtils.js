/**
 * Modbus RTU 工具类
 * 实现字节级RTU格式构造和CRC校验功能
 */

class ModbusRtuUtils {
  /**
   * 计算CRC16校验码 (Modbus标准)
   * @param {Buffer} buffer - 数据缓冲区
   * @returns {number} CRC16校验码
   */
  static calculateCRC16(buffer) {
    let crc = 0xFFFF;
    
    for (let i = 0; i < buffer.length; i++) {
      crc ^= buffer[i];
      
      for (let j = 0; j < 8; j++) {
        if (crc & 0x0001) {
          crc = (crc >> 1) ^ 0xA001;
        } else {
          crc = crc >> 1;
        }
      }
    }
    
    return crc;
  }

  /**
   * 构造读取保持寄存器的RTU指令 (功能码03)
   * @param {number} slaveAddress - 从站地址 (1-247)
   * @param {number} startAddress - 起始地址 (0-65535)
   * @param {number} quantity - 寄存器数量 (1-125)
   * @returns {Buffer} RTU指令字节流
   */
  static buildReadHoldingRegistersRTU(slaveAddress, startAddress, quantity) {
    if (slaveAddress < 1 || slaveAddress > 247) {
      throw new Error('从站地址必须在1-247范围内');
    }
    if (startAddress < 0 || startAddress > 65535) {
      throw new Error('起始地址必须在0-65535范围内');
    }
    if (quantity < 1 || quantity > 125) {
      throw new Error('寄存器数量必须在1-125范围内');
    }

    // 构造数据部分 (不包含CRC)
    const dataBuffer = Buffer.alloc(6);
    dataBuffer.writeUInt8(slaveAddress, 0);     // 从站地址
    dataBuffer.writeUInt8(0x03, 1);             // 功能码 03
    dataBuffer.writeUInt16BE(startAddress, 2);  // 起始地址 (大端序)
    dataBuffer.writeUInt16BE(quantity, 4);      // 寄存器数量 (大端序)

    // 计算CRC校验码
    const crc = this.calculateCRC16(dataBuffer);
    
    // 构造完整的RTU指令
    const rtuBuffer = Buffer.alloc(8);
    dataBuffer.copy(rtuBuffer, 0);
    rtuBuffer.writeUInt16LE(crc, 6);            // CRC校验码 (小端序)

    return rtuBuffer;
  }

  /**
   * 构造读取输入寄存器的RTU指令 (功能码04)
   * @param {number} slaveAddress - 从站地址
   * @param {number} startAddress - 起始地址
   * @param {number} quantity - 寄存器数量
   * @returns {Buffer} RTU指令字节流
   */
  static buildReadInputRegistersRTU(slaveAddress, startAddress, quantity) {
    if (slaveAddress < 1 || slaveAddress > 247) {
      throw new Error('从站地址必须在1-247范围内');
    }
    if (startAddress < 0 || startAddress > 65535) {
      throw new Error('起始地址必须在0-65535范围内');
    }
    if (quantity < 1 || quantity > 125) {
      throw new Error('寄存器数量必须在1-125范围内');
    }

    const dataBuffer = Buffer.alloc(6);
    dataBuffer.writeUInt8(slaveAddress, 0);
    dataBuffer.writeUInt8(0x04, 1);             // 功能码 04
    dataBuffer.writeUInt16BE(startAddress, 2);
    dataBuffer.writeUInt16BE(quantity, 4);

    const crc = this.calculateCRC16(dataBuffer);
    
    const rtuBuffer = Buffer.alloc(8);
    dataBuffer.copy(rtuBuffer, 0);
    rtuBuffer.writeUInt16LE(crc, 6);

    return rtuBuffer;
  }

  /**
   * 构造写入单个寄存器的RTU指令 (功能码06)
   * @param {number} slaveAddress - 从站地址
   * @param {number} registerAddress - 寄存器地址
   * @param {number} value - 写入值 (0-65535)
   * @returns {Buffer} RTU指令字节流
   */
  static buildWriteSingleRegisterRTU(slaveAddress, registerAddress, value) {
    if (slaveAddress < 1 || slaveAddress > 247) {
      throw new Error('从站地址必须在1-247范围内');
    }
    if (registerAddress < 0 || registerAddress > 65535) {
      throw new Error('寄存器地址必须在0-65535范围内');
    }
    if (value < 0 || value > 65535) {
      throw new Error('写入值必须在0-65535范围内');
    }

    const dataBuffer = Buffer.alloc(6);
    dataBuffer.writeUInt8(slaveAddress, 0);
    dataBuffer.writeUInt8(0x06, 1);             // 功能码 06
    dataBuffer.writeUInt16BE(registerAddress, 2);
    dataBuffer.writeUInt16BE(value, 4);

    const crc = this.calculateCRC16(dataBuffer);
    
    const rtuBuffer = Buffer.alloc(8);
    dataBuffer.copy(rtuBuffer, 0);
    rtuBuffer.writeUInt16LE(crc, 6);

    return rtuBuffer;
  }

  /**
   * 构造写入多个寄存器的RTU指令 (功能码16)
   * @param {number} slaveAddress - 从站地址
   * @param {number} startAddress - 起始地址
   * @param {Array<number>} values - 写入值数组
   * @returns {Buffer} RTU指令字节流
   */
  static buildWriteMultipleRegistersRTU(slaveAddress, startAddress, values) {
    if (slaveAddress < 1 || slaveAddress > 247) {
      throw new Error('从站地址必须在1-247范围内');
    }
    if (startAddress < 0 || startAddress > 65535) {
      throw new Error('起始地址必须在0-65535范围内');
    }
    if (!Array.isArray(values) || values.length === 0 || values.length > 123) {
      throw new Error('写入值数组长度必须在1-123范围内');
    }

    const quantity = values.length;
    const byteCount = quantity * 2;
    
    const dataBuffer = Buffer.alloc(7 + byteCount);
    dataBuffer.writeUInt8(slaveAddress, 0);
    dataBuffer.writeUInt8(0x10, 1);             // 功能码 16
    dataBuffer.writeUInt16BE(startAddress, 2);
    dataBuffer.writeUInt16BE(quantity, 4);
    dataBuffer.writeUInt8(byteCount, 6);

    // 写入寄存器值
    for (let i = 0; i < values.length; i++) {
      if (values[i] < 0 || values[i] > 65535) {
        throw new Error(`寄存器值[${i}]必须在0-65535范围内`);
      }
      dataBuffer.writeUInt16BE(values[i], 7 + i * 2);
    }

    const crc = this.calculateCRC16(dataBuffer);
    
    const rtuBuffer = Buffer.alloc(dataBuffer.length + 2);
    dataBuffer.copy(rtuBuffer, 0);
    rtuBuffer.writeUInt16LE(crc, dataBuffer.length);

    return rtuBuffer;
  }

  /**
   * 解析RTU响应数据
   * @param {Buffer} responseBuffer - 响应数据缓冲区
   * @returns {Object} 解析结果
   */
  static parseRTUResponse(responseBuffer) {
    if (responseBuffer.length < 5) {
      throw new Error('RTU响应数据长度不足');
    }

    const slaveAddress = responseBuffer.readUInt8(0);
    const functionCode = responseBuffer.readUInt8(1);
    
    // 检查是否为错误响应
    if (functionCode & 0x80) {
      const exceptionCode = responseBuffer.readUInt8(2);
      return {
        success: false,
        slaveAddress,
        functionCode: functionCode & 0x7F,
        exceptionCode,
        error: this.getExceptionMessage(exceptionCode)
      };
    }

    // 计算预期的响应长度并处理额外字节
    let processedBuffer = responseBuffer;
    let extraBytesInfo = null;
    
    if (functionCode === 0x03 || functionCode === 0x04) {
      const byteCount = responseBuffer.readUInt8(2);
      const expectedLength = 3 + byteCount + 2; // 从站地址(1) + 功能码(1) + 字节数(1) + 数据(byteCount) + CRC(2)
      
      if (responseBuffer.length > expectedLength) {
        const extraBytes = responseBuffer.slice(expectedLength);
        extraBytesInfo = {
          count: extraBytes.length,
          data: this.bufferToHexString(extraBytes)
        };
        processedBuffer = responseBuffer.slice(0, expectedLength);
      }
    }

    // 验证CRC校验码
    const dataLength = processedBuffer.length - 2;
    const dataBuffer = processedBuffer.slice(0, dataLength);
    const receivedCRC = processedBuffer.readUInt16LE(dataLength);
    const calculatedCRC = this.calculateCRC16(dataBuffer);
    
    if (receivedCRC !== calculatedCRC) {
      const error = new Error('CRC校验失败');
      error.details = {
        receivedCRC: `0x${receivedCRC.toString(16).padStart(4, '0')}`,
        calculatedCRC: `0x${calculatedCRC.toString(16).padStart(4, '0')}`,
        dataHex: this.bufferToHexString(dataBuffer),
        extraBytes: extraBytesInfo
      };
      throw error;
    }

    let result = {
      success: true,
      slaveAddress,
      functionCode,
      data: null
    };

    // 如果有额外字节，添加到结果中
    if (extraBytesInfo) {
      result.extraBytes = extraBytesInfo;
    }

    // 根据功能码解析数据
    switch (functionCode) {
      case 0x03: // 读取保持寄存器响应
      case 0x04: // 读取输入寄存器响应
        const byteCount = processedBuffer.readUInt8(2);
        const registerCount = byteCount / 2;
        const registers = [];
        
        for (let i = 0; i < registerCount; i++) {
          registers.push(processedBuffer.readUInt16BE(3 + i * 2));
        }
        
        result.data = {
          byteCount,
          registerCount,
          registers
        };
        break;
        
      case 0x06: // 写入单个寄存器响应
        result.data = {
          registerAddress: processedBuffer.readUInt16BE(2),
          value: processedBuffer.readUInt16BE(4)
        };
        break;
        
      case 0x10: // 写入多个寄存器响应
        result.data = {
          startAddress: processedBuffer.readUInt16BE(2),
          quantity: processedBuffer.readUInt16BE(4)
        };
        break;
        
      default:
        result.data = processedBuffer.slice(2, dataLength);
    }

    return result;
  }

  /**
   * 获取异常码对应的错误信息
   * @param {number} exceptionCode - 异常码
   * @returns {string} 错误信息
   */
  static getExceptionMessage(exceptionCode) {
    const messages = {
      0x01: '非法功能码',
      0x02: '非法数据地址',
      0x03: '非法数据值',
      0x04: '从站设备故障',
      0x05: '确认',
      0x06: '从站设备忙',
      0x08: '存储奇偶性差错',
      0x0A: '不可用网关路径',
      0x0B: '网关目标设备响应失败'
    };
    
    return messages[exceptionCode] || `未知异常码: 0x${exceptionCode.toString(16).toUpperCase()}`;
  }

  /**
   * 将RTU指令转换为16进制字符串显示
   * @param {Buffer} buffer - RTU指令缓冲区
   * @returns {string} 16进制字符串 (如: "01 03 00 1F 00 02 F5 CD")
   */
  static bufferToHexString(buffer) {
    return Array.from(buffer)
      .map(byte => byte.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
  }

  /**
   * 将16进制字符串转换为Buffer
   * @param {string} hexString - 16进制字符串 (如: "01 03 00 1F 00 02 F5 CD")
   * @returns {Buffer} 缓冲区
   */
  static hexStringToBuffer(hexString) {
    const cleanHex = hexString.replace(/\s+/g, '');
    if (cleanHex.length % 2 !== 0) {
      throw new Error('16进制字符串长度必须为偶数');
    }
    
    const bytes = [];
    for (let i = 0; i < cleanHex.length; i += 2) {
      const byte = parseInt(cleanHex.substr(i, 2), 16);
      if (isNaN(byte)) {
        throw new Error(`无效的16进制字符: ${cleanHex.substr(i, 2)}`);
      }
      bytes.push(byte);
    }
    
    return Buffer.from(bytes);
  }

  /**
   * 验证RTU指令的CRC校验码
   * @param {Buffer} rtuBuffer - RTU指令缓冲区
   * @returns {boolean} 校验是否通过
   */
  static validateCRC(rtuBuffer) {
    if (rtuBuffer.length < 4) {
      return false;
    }
    
    const dataLength = rtuBuffer.length - 2;
    const dataBuffer = rtuBuffer.slice(0, dataLength);
    const receivedCRC = rtuBuffer.readUInt16LE(dataLength);
    const calculatedCRC = this.calculateCRC16(dataBuffer);
    
    return receivedCRC === calculatedCRC;
  }
}

module.exports = ModbusRtuUtils;