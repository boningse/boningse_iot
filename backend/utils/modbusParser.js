const logger = require('./logger');

/**
 * Modbus 数据解析器
 */
class ModbusParser {
  /**
   * 解析16位有符号整数
   * @param {number} value - 原始值
   * @returns {number} 解析后的值
   */
  static parseInt16(value) {
    return value > 32767 ? value - 65536 : value;
  }

  /**
   * 解析16位无符号整数
   * @param {number} value - 原始值
   * @returns {number} 解析后的值
   */
  static parseUint16(value) {
    return value;
  }

  /**
   * 解析32位有符号整数（大端序）
   * @param {number} highWord - 高位字
   * @param {number} lowWord - 低位字
   * @returns {number} 解析后的值
   */
  static parseInt32BE(highWord, lowWord) {
    const value = (highWord << 16) | lowWord;
    return value > 2147483647 ? value - 4294967296 : value;
  }

  /**
   * 解析32位有符号整数（小端序）
   * @param {number} lowWord - 低位字
   * @param {number} highWord - 高位字
   * @returns {number} 解析后的值
   */
  static parseInt32LE(lowWord, highWord) {
    return this.parseInt32BE(highWord, lowWord);
  }

  /**
   * 解析32位无符号整数（大端序）
   * @param {number} highWord - 高位字
   * @param {number} lowWord - 低位字
   * @returns {number} 解析后的值
   */
  static parseUint32BE(highWord, lowWord) {
    return (highWord << 16) | lowWord;
  }

  /**
   * 解析32位无符号整数（小端序）
   * @param {number} lowWord - 低位字
   * @param {number} highWord - 高位字
   * @returns {number} 解析后的值
   */
  static parseUint32LE(lowWord, highWord) {
    return this.parseUint32BE(highWord, lowWord);
  }

  /**
   * 解析32位浮点数（大端序）
   * @param {number} highWord - 高位字
   * @param {number} lowWord - 低位字
   * @returns {number} 解析后的值
   */
  static parseFloat32BE(highWord, lowWord) {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt16BE(highWord, 0);
    buffer.writeUInt16BE(lowWord, 2);
    return buffer.readFloatBE(0);
  }

  /**
   * 解析32位浮点数（小端序）
   * @param {number} lowWord - 低位字
   * @param {number} highWord - 高位字
   * @returns {number} 解析后的值
   */
  static parseFloat32LE(lowWord, highWord) {
    const buffer = Buffer.allocUnsafe(4);
    buffer.writeUInt16BE(lowWord, 0);
    buffer.writeUInt16BE(highWord, 2);
    return buffer.readFloatLE(0);
  }

  /**
   * 解析64位浮点数（大端序）
   * @param {Array} words - 4个16位字的数组
   * @returns {number} 解析后的值
   */
  static parseFloat64BE(words) {
    if (words.length < 4) {
      throw new Error('需要4个16位字来解析64位浮点数');
    }
    const buffer = Buffer.allocUnsafe(8);
    buffer.writeUInt16BE(words[0], 0);
    buffer.writeUInt16BE(words[1], 2);
    buffer.writeUInt16BE(words[2], 4);
    buffer.writeUInt16BE(words[3], 6);
    return buffer.readDoubleBE(0);
  }

  /**
   * 解析字符串
   * @param {Array} words - 16位字数组
   * @param {string} encoding - 编码格式
   * @returns {string} 解析后的字符串
   */
  static parseString(words, encoding = 'ascii') {
    const buffer = Buffer.allocUnsafe(words.length * 2);
    words.forEach((word, index) => {
      buffer.writeUInt16BE(word, index * 2);
    });
    return buffer.toString(encoding).replace(/\0/g, '').trim();
  }

  /**
   * 解析位字段
   * @param {number} value - 原始值
   * @param {Array} bitMap - 位映射配置
   * @returns {Object} 解析后的位字段对象
   */
  static parseBitField(value, bitMap) {
    const result = {};
    bitMap.forEach(bit => {
      const { name, position } = bit;
      result[name] = Boolean(value & (1 << position));
    });
    return result;
  }

  /**
   * 应用缩放和偏移
   * @param {number} value - 原始值
   * @param {number} scale - 缩放因子
   * @param {number} offset - 偏移量
   * @returns {number} 处理后的值
   */
  static applyScaleAndOffset(value, scale = 1, offset = 0) {
    return (value * scale) + offset;
  }

  /**
   * 根据配置解析寄存器数据
   * @param {Array} rawData - 原始数据数组
   * @param {Array} registerConfig - 寄存器配置
   * @returns {Object} 解析后的数据对象
   */
  static parseRegisters(rawData, registerConfig) {
    const result = {};
    let dataIndex = 0;

    try {
      registerConfig.forEach(config => {
        const {
          name,
          dataType,
          address,
          length = 1,
          scale = 1,
          offset = 0,
          byteOrder = 'BE', // 大端序
          bitMap,
          encoding = 'ascii'
        } = config;

        if (dataIndex >= rawData.length) {
          logger.warn(`数据索引超出范围: ${name}`);
          return;
        }

        let value;
        const currentData = rawData.slice(dataIndex, dataIndex + length);

        switch (dataType.toLowerCase()) {
          case 'int16':
            value = this.parseInt16(currentData[0]);
            dataIndex += 1;
            break;

          case 'uint16':
            value = this.parseUint16(currentData[0]);
            dataIndex += 1;
            break;

          case 'int32':
            if (currentData.length < 2) {
              throw new Error(`${name}: 需要2个寄存器来解析int32`);
            }
            value = byteOrder === 'BE' 
              ? this.parseInt32BE(currentData[0], currentData[1])
              : this.parseInt32LE(currentData[0], currentData[1]);
            dataIndex += 2;
            break;

          case 'uint32':
            if (currentData.length < 2) {
              throw new Error(`${name}: 需要2个寄存器来解析uint32`);
            }
            value = byteOrder === 'BE'
              ? this.parseUint32BE(currentData[0], currentData[1])
              : this.parseUint32LE(currentData[0], currentData[1]);
            dataIndex += 2;
            break;

          case 'float32':
            if (currentData.length < 2) {
              throw new Error(`${name}: 需要2个寄存器来解析float32`);
            }
            value = byteOrder === 'BE'
              ? this.parseFloat32BE(currentData[0], currentData[1])
              : this.parseFloat32LE(currentData[0], currentData[1]);
            dataIndex += 2;
            break;

          case 'float64':
            if (currentData.length < 4) {
              throw new Error(`${name}: 需要4个寄存器来解析float64`);
            }
            value = this.parseFloat64BE(currentData);
            dataIndex += 4;
            break;

          case 'string':
            value = this.parseString(currentData, encoding);
            dataIndex += length;
            break;

          case 'boolean':
            value = Boolean(currentData[0]);
            dataIndex += 1;
            break;

          case 'bitfield':
            if (!bitMap) {
              throw new Error(`${name}: bitfield类型需要bitMap配置`);
            }
            value = this.parseBitField(currentData[0], bitMap);
            dataIndex += 1;
            break;

          default:
            logger.warn(`不支持的数据类型: ${dataType}`);
            value = currentData[0];
            dataIndex += 1;
        }

        // 应用缩放和偏移（除了字符串和位字段）
        if (typeof value === 'number' && dataType !== 'bitfield') {
          value = this.applyScaleAndOffset(value, scale, offset);
        }

        result[name] = value;
      });

      return result;
    } catch (error) {
      logger.error(`解析寄存器数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 解析线圈数据
   * @param {Array} rawData - 原始数据数组
   * @param {Array} coilConfig - 线圈配置
   * @returns {Object} 解析后的数据对象
   */
  static parseCoils(rawData, coilConfig) {
    const result = {};

    try {
      coilConfig.forEach((config, index) => {
        const { name } = config;
        if (index < rawData.length) {
          result[name] = Boolean(rawData[index]);
        }
      });

      return result;
    } catch (error) {
      logger.error(`解析线圈数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 准备写入数据
   * @param {*} value - 要写入的值
   * @param {string} dataType - 数据类型
   * @param {string} byteOrder - 字节序
   * @returns {Array|number} 准备好的数据
   */
  static prepareWriteData(value, dataType, byteOrder = 'BE') {
    try {
      switch (dataType.toLowerCase()) {
        case 'int16':
        case 'uint16':
          return Number(value) & 0xFFFF;

        case 'int32':
        case 'uint32':
          const int32Value = Number(value);
          if (byteOrder === 'BE') {
            return [(int32Value >> 16) & 0xFFFF, int32Value & 0xFFFF];
          } else {
            return [int32Value & 0xFFFF, (int32Value >> 16) & 0xFFFF];
          }

        case 'float32':
          const buffer = Buffer.allocUnsafe(4);
          buffer.writeFloatBE(Number(value), 0);
          if (byteOrder === 'BE') {
            return [buffer.readUInt16BE(0), buffer.readUInt16BE(2)];
          } else {
            return [buffer.readUInt16BE(2), buffer.readUInt16BE(0)];
          }

        case 'boolean':
          return Boolean(value);

        default:
          return Number(value);
      }
    } catch (error) {
      logger.error(`准备写入数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 验证数据范围
   * @param {*} value - 值
   * @param {string} dataType - 数据类型
   * @param {Object} range - 范围配置
   * @returns {boolean} 验证结果
   */
  static validateRange(value, dataType, range) {
    if (!range) return true;

    const numValue = Number(value);
    const { min, max } = range;

    if (min !== undefined && numValue < min) {
      return false;
    }

    if (max !== undefined && numValue > max) {
      return false;
    }

    return true;
  }

  /**
   * 获取数据类型的默认范围
   * @param {string} dataType - 数据类型
   * @returns {Object} 默认范围
   */
  static getDefaultRange(dataType) {
    const ranges = {
      'int16': { min: -32768, max: 32767 },
      'uint16': { min: 0, max: 65535 },
      'int32': { min: -2147483648, max: 2147483647 },
      'uint32': { min: 0, max: 4294967295 },
      'float32': { min: -3.4028235e+38, max: 3.4028235e+38 },
      'boolean': { min: 0, max: 1 }
    };

    return ranges[dataType.toLowerCase()] || null;
  }
}

module.exports = ModbusParser;