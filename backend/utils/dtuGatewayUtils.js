/**
 * DTU网关工具类
 */

const dtuConfig = require('../config/dtuGateway');

class DtuGatewayUtils {
  /**
   * 解析MQTT主题，提取厂商编号和IMEI
   * @param {string} topic - MQTT主题
   * @returns {Object|null} - 解析结果 {manufacturerCode, imei, type}
   */
  static parseMqttTopic(topic) {
    try {
      // 匹配数据主题: zhhl/{manufacturer_code}/{imei}/publish
      const dataMatch = topic.match(/^zhhl\/(\w+)\/(\w+)\/publish$/);
      if (dataMatch) {
        return {
          manufacturerCode: dataMatch[1],
          imei: dataMatch[2],
          type: 'data'
        };
      }
      
      // 匹配命令响应主题: zhhl/{manufacturer_code}/publish/{imei}
      const commandMatch = topic.match(/^zhhl\/(\w+)\/publish\/(\w+)$/);
      if (commandMatch) {
        return {
          manufacturerCode: commandMatch[1],
          imei: commandMatch[2],
          type: 'command_response'
        };
      }
      
      // 匹配心跳主题: zhhl/{manufacturer_code}/{imei}/heartbeat
      const heartbeatMatch = topic.match(/^zhhl\/(\w+)\/(\w+)\/heartbeat$/);
      if (heartbeatMatch) {
        return {
          manufacturerCode: heartbeatMatch[1],
          imei: heartbeatMatch[2],
          type: 'heartbeat'
        };
      }
      
      // 匹配状态主题: zhhl/{manufacturer_code}/{imei}/status
      const statusMatch = topic.match(/^zhhl\/(\w+)\/(\w+)\/status$/);
      if (statusMatch) {
        return {
          manufacturerCode: statusMatch[1],
          imei: statusMatch[2],
          type: 'status'
        };
      }
      
      return null;
    } catch (error) {
      console.error('解析MQTT主题失败:', error);
      return null;
    }
  }
  
  /**
   * 生成MQTT主题
   * @param {string} type - 主题类型 (data, command, heartbeat, status)
   * @param {string} manufacturerCode - 厂商编号
   * @param {string} imei - 设备IMEI
   * @returns {string} - MQTT主题
   */
  static generateMqttTopic(type, manufacturerCode, imei) {
    const patterns = {
      data: dtuConfig.mqtt.dataTopicPattern,
      command: dtuConfig.mqtt.commandTopicPattern,
      heartbeat: dtuConfig.mqtt.heartbeatTopicPattern,
      status: dtuConfig.mqtt.statusTopicPattern
    };
    
    const pattern = patterns[type];
    if (!pattern) {
      throw new Error(`不支持的主题类型: ${type}`);
    }
    
    return pattern
      .replace('{manufacturer_code}', manufacturerCode)
      .replace('{imei}', imei);
  }
  
  /**
   * 解析DTU数据消息
   * @param {string|Buffer} message - MQTT消息
   * @returns {Object|null} - 解析后的数据
   */
  static parseDataMessage(message) {
    try {
      let data;
      
      if (Buffer.isBuffer(message)) {
        data = JSON.parse(message.toString());
      } else {
        data = JSON.parse(message);
      }
      
      // 验证必要字段
      if (!data.timestamp) {
        data.timestamp = new Date().toISOString();
      }
      
      return data;
    } catch (error) {
      console.error('解析DTU数据消息失败:', error);
      return null;
    }
  }
  
  /**
   * 解析Modbus数据
   * @param {Object} modbusData - Modbus原始数据
   * @param {Object} protocolConfig - 协议配置
   * @returns {Object} - 解析后的电表数据
   */
  static parseModbusData(modbusData, protocolConfig) {
    try {
      const parsedData = {
        timestamp: new Date().toISOString(),
        deviceAddress: modbusData.deviceAddress || modbusData.slaveId,
        functionCode: modbusData.functionCode,
        registers: {},
        quality: 1.0
      };
      
      if (!protocolConfig || !protocolConfig.config_data) {
        // 如果没有协议配置，返回原始数据
        parsedData.rawData = modbusData;
        return parsedData;
      }
      
      const config = typeof protocolConfig.config_data === 'string' 
        ? JSON.parse(protocolConfig.config_data) 
        : protocolConfig.config_data;
      
      // 解析寄存器数据
      if (modbusData.data && config.registers) {
        config.registers.forEach((register, index) => {
          if (index < modbusData.data.length) {
            const value = this.parseRegisterValue(
              modbusData.data[index], 
              register.dataType, 
              register.scale
            );
            
            parsedData.registers[register.name] = {
              value: value,
              unit: register.unit || '',
              address: register.address,
              dataType: register.dataType
            };
          }
        });
      }
      
      return parsedData;
    } catch (error) {
      console.error('解析Modbus数据失败:', error);
      return {
        timestamp: new Date().toISOString(),
        error: error.message,
        rawData: modbusData,
        quality: 0.0
      };
    }
  }
  
  /**
   * 解析寄存器值
   * @param {number} rawValue - 原始值
   * @param {string} dataType - 数据类型
   * @param {number} scale - 缩放因子
   * @returns {number} - 解析后的值
   */
  static parseRegisterValue(rawValue, dataType, scale = 1) {
    try {
      let value = rawValue;
      
      switch (dataType) {
        case 'uint16':
          value = rawValue & 0xFFFF;
          break;
        case 'int16':
          value = rawValue > 32767 ? rawValue - 65536 : rawValue;
          break;
        case 'uint32':
          value = rawValue >>> 0;
          break;
        case 'int32':
          value = rawValue | 0;
          break;
        case 'float':
          // 假设是IEEE 754格式
          const buffer = Buffer.allocUnsafe(4);
          buffer.writeUInt32BE(rawValue, 0);
          value = buffer.readFloatBE(0);
          break;
        default:
          value = rawValue;
      }
      
      return value * scale;
    } catch (error) {
      console.error('解析寄存器值失败:', error);
      return rawValue;
    }
  }
  
  /**
   * 计算数据质量
   * @param {Object} data - 数据对象
   * @returns {number} - 质量值 (0-1)
   */
  static calculateDataQuality(data) {
    try {
      let quality = 1.0;
      
      // 检查时间戳
      if (!data.timestamp) {
        quality -= 0.2;
      } else {
        const age = Date.now() - new Date(data.timestamp).getTime();
        if (age > 60000) { // 超过1分钟
          quality -= 0.1;
        }
      }
      
      // 检查错误
      if (data.error) {
        quality -= 0.5;
      }
      
      // 检查数据完整性
      if (data.registers) {
        const totalRegisters = Object.keys(data.registers).length;
        const validRegisters = Object.values(data.registers)
          .filter(reg => reg.value !== null && reg.value !== undefined).length;
        
        if (totalRegisters > 0) {
          quality *= (validRegisters / totalRegisters);
        }
      }
      
      return Math.max(0, Math.min(1, quality));
    } catch (error) {
      console.error('计算数据质量失败:', error);
      return 0.0;
    }
  }
  
  /**
   * 格式化Modbus命令
   * @param {Object} command - 命令对象
   * @returns {Object} - 格式化后的命令
   */
  static formatModbusCommand(command) {
    return {
      deviceAddress: command.deviceAddress || command.slaveId || 1,
      functionCode: command.functionCode || 3,
      startAddress: command.startAddress || command.address || 0,
      quantity: command.quantity || command.count || 1,
      values: command.values || [],
      timeout: command.timeout || dtuConfig.modbus.timeout
    };
  }
  
  /**
   * 验证设备在线状态
   * @param {Date} lastSeen - 最后在线时间
   * @returns {boolean} - 是否在线
   */
  static isDeviceOnline(lastSeen) {
    if (!lastSeen) return false;
    
    const now = new Date();
    const lastSeenTime = new Date(lastSeen);
    const diffSeconds = (now - lastSeenTime) / 1000;
    
    return diffSeconds <= dtuConfig.device.offlineTimeout;
  }
  
  /**
   * 生成设备唯一标识
   * @param {string} manufacturerCode - 厂商编号
   * @param {string} imei - 设备IMEI
   * @returns {string} - 设备唯一标识
   */
  static generateDeviceKey(manufacturerCode, imei) {
    return `${manufacturerCode}:${imei}`;
  }
}

module.exports = DtuGatewayUtils;