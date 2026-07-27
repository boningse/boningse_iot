const jsmodbus = require('jsmodbus');
const net = require('net');
const logger = require('../utils/logger');
const { ProtocolConfig } = require('../models');

class ModbusService {
  constructor() {
    this.connections = new Map(); // 存储活跃连接
    this.clients = new Map(); // 存储客户端实例
  }

  /**
   * 创建 Modbus TCP 连接
   * @param {Object} config - 连接配置
   * @param {string} config.host - 主机地址
   * @param {number} config.port - 端口号
   * @param {number} config.unitId - 单元ID
   * @param {number} config.timeout - 超时时间
   */
  async createTcpConnection(config) {
    const { host, port = 502, unitId = 1, timeout = 5000 } = config;
    const connectionKey = `tcp_${host}_${port}_${unitId}`;

    try {
      if (this.connections.has(connectionKey)) {
        return this.connections.get(connectionKey);
      }

      const socket = new net.Socket();
      const client = new jsmodbus.client.TCP(socket, unitId);
      
      socket.setTimeout(timeout);
      
      await new Promise((resolve, reject) => {
        socket.connect(port, host, () => {
          logger.info(`Modbus TCP连接成功: ${host}:${port}`);
          resolve();
        });
        
        socket.on('error', (err) => {
          logger.error(`Modbus TCP连接错误: ${err.message}`);
          reject(err);
        });
        
        socket.on('timeout', () => {
          logger.error(`Modbus TCP连接超时: ${host}:${port}`);
          reject(new Error('Connection timeout'));
        });
      });

      const connection = {
        client,
        socket,
        config,
        lastUsed: Date.now(),
        isConnected: true
      };

      this.connections.set(connectionKey, connection);
      this.clients.set(connectionKey, client);
      
      // 监听连接断开
      socket.on('close', () => {
        logger.info(`Modbus TCP连接关闭: ${host}:${port}`);
        this.connections.delete(connectionKey);
        this.clients.delete(connectionKey);
      });

      return connection;
    } catch (error) {
      logger.error(`创建Modbus TCP连接失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 读取保持寄存器
   * @param {string} connectionKey - 连接键
   * @param {number} address - 起始地址
   * @param {number} quantity - 读取数量
   */
  async readHoldingRegisters(connectionKey, address, quantity) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.readHoldingRegisters(address, quantity);
      connection.lastUsed = Date.now();
      
      logger.debug(`读取保持寄存器成功: 地址=${address}, 数量=${quantity}`);
      return response.response.body.valuesAsArray;
    } catch (error) {
      logger.error(`读取保持寄存器失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 读取输入寄存器
   * @param {string} connectionKey - 连接键
   * @param {number} address - 起始地址
   * @param {number} quantity - 读取数量
   */
  async readInputRegisters(connectionKey, address, quantity) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.readInputRegisters(address, quantity);
      connection.lastUsed = Date.now();
      
      logger.debug(`读取输入寄存器成功: 地址=${address}, 数量=${quantity}`);
      return response.response.body.valuesAsArray;
    } catch (error) {
      logger.error(`读取输入寄存器失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 读取线圈状态
   * @param {string} connectionKey - 连接键
   * @param {number} address - 起始地址
   * @param {number} quantity - 读取数量
   */
  async readCoils(connectionKey, address, quantity) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.readCoils(address, quantity);
      connection.lastUsed = Date.now();
      
      logger.debug(`读取线圈状态成功: 地址=${address}, 数量=${quantity}`);
      return response.response.body.valuesAsArray;
    } catch (error) {
      logger.error(`读取线圈状态失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 读取离散输入
   * @param {string} connectionKey - 连接键
   * @param {number} address - 起始地址
   * @param {number} quantity - 读取数量
   */
  async readDiscreteInputs(connectionKey, address, quantity) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.readDiscreteInputs(address, quantity);
      connection.lastUsed = Date.now();
      
      logger.debug(`读取离散输入成功: 地址=${address}, 数量=${quantity}`);
      return response.response.body.valuesAsArray;
    } catch (error) {
      logger.error(`读取离散输入失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 写入单个线圈
   * @param {string} connectionKey - 连接键
   * @param {number} address - 地址
   * @param {boolean} value - 值
   */
  async writeSingleCoil(connectionKey, address, value) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.writeSingleCoil(address, value);
      connection.lastUsed = Date.now();
      
      logger.debug(`写入单个线圈成功: 地址=${address}, 值=${value}`);
      return response;
    } catch (error) {
      logger.error(`写入单个线圈失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 写入单个寄存器
   * @param {string} connectionKey - 连接键
   * @param {number} address - 地址
   * @param {number} value - 值
   */
  async writeSingleRegister(connectionKey, address, value) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.writeSingleRegister(address, value);
      connection.lastUsed = Date.now();
      
      logger.debug(`写入单个寄存器成功: 地址=${address}, 值=${value}`);
      return response;
    } catch (error) {
      logger.error(`写入单个寄存器失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 写入多个寄存器
   * @param {string} connectionKey - 连接键
   * @param {number} address - 起始地址
   * @param {Array} values - 值数组
   */
  async writeMultipleRegisters(connectionKey, address, values) {
    try {
      const connection = this.connections.get(connectionKey);
      if (!connection || !connection.isConnected) {
        throw new Error('Modbus连接不可用');
      }

      const response = await connection.client.writeMultipleRegisters(address, values);
      connection.lastUsed = Date.now();
      
      logger.debug(`写入多个寄存器成功: 地址=${address}, 数量=${values.length}`);
      return response;
    } catch (error) {
      logger.error(`写入多个寄存器失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 根据协议配置解析设备数据
   * @param {Object} protocolConfig - 协议配置
   * @param {Array} rawData - 原始数据
   */
  parseDeviceData(protocolConfig, rawData) {
    try {
      const { data_parsing_config } = protocolConfig;
      if (!data_parsing_config || !data_parsing_config.modbus) {
        throw new Error('缺少Modbus数据解析配置');
      }

      const { registers } = data_parsing_config.modbus;
      const parsedData = {};

      registers.forEach((register, index) => {
        if (index < rawData.length) {
          const value = rawData[index];
          
          // 根据数据类型进行转换
          switch (register.dataType) {
            case 'int16':
              parsedData[register.name] = value > 32767 ? value - 65536 : value;
              break;
            case 'uint16':
              parsedData[register.name] = value;
              break;
            case 'float32':
              // 需要两个寄存器组成一个float32
              if (index + 1 < rawData.length) {
                const buffer = Buffer.allocUnsafe(4);
                buffer.writeUInt16BE(value, 0);
                buffer.writeUInt16BE(rawData[index + 1], 2);
                parsedData[register.name] = buffer.readFloatBE(0);
              }
              break;
            case 'boolean':
              parsedData[register.name] = Boolean(value);
              break;
            default:
              parsedData[register.name] = value;
          }

          // 应用缩放因子
          if (register.scale && typeof parsedData[register.name] === 'number') {
            parsedData[register.name] *= register.scale;
          }

          // 应用偏移量
          if (register.offset && typeof parsedData[register.name] === 'number') {
            parsedData[register.name] += register.offset;
          }
        }
      });

      return parsedData;
    } catch (error) {
      logger.error(`解析Modbus设备数据失败: ${error.message}`);
      throw error;
    }
  }

  /**
   * 根据协议配置读取设备数据
   * @param {string} deviceId - 设备ID
   * @param {Object} connectionConfig - 连接配置
   * @param {Object} protocolConfig - 协议配置
   */
  async readDeviceData(deviceId, connectionConfig, protocolConfig) {
    try {
      // 创建连接
      const connection = await this.createTcpConnection(connectionConfig);
      const connectionKey = `tcp_${connectionConfig.host}_${connectionConfig.port}_${connectionConfig.unitId}`;

      const { data_parsing_config } = protocolConfig;
      if (!data_parsing_config || !data_parsing_config.modbus) {
        throw new Error('缺少Modbus数据解析配置');
      }

      // 使用新的modbus_registers配置
      const registers = protocolConfig.modbus_registers;
      if (!registers || !Array.isArray(registers)) {
        throw new Error('缺少modbus_registers配置');
      }
      
      let rawData = [];

      // 根据配置读取不同类型的数据
      for (const register of registers) {
        let data;
        const quantity = register.count || 1;
        switch (register.function_code) {
          case 3: // 读取保持寄存器
            data = await this.readHoldingRegisters(connectionKey, register.address, quantity);
            break;
          case 4: // 读取输入寄存器
            data = await this.readInputRegisters(connectionKey, register.address, quantity);
            break;
          case 1: // 读取线圈状态
            data = await this.readCoils(connectionKey, register.address, quantity);
            break;
          case 2: // 读取离散输入
            data = await this.readDiscreteInputs(connectionKey, register.address, quantity);
            break;
          default:
            logger.warn(`不支持的Modbus功能码: ${register.function_code}`);
            continue;
        }
        rawData = rawData.concat(data);
      }

      // 解析数据
      const parsedData = this.parseDeviceData(protocolConfig, rawData);
      
      logger.info(`成功读取设备数据: ${deviceId}`);
      return {
        deviceId,
        timestamp: new Date(),
        data: parsedData,
        rawData
      };
    } catch (error) {
      logger.error(`读取设备数据失败: ${deviceId}, ${error.message}`);
      throw error;
    }
  }

  /**
   * 执行设备命令
   * @param {string} deviceId - 设备ID
   * @param {Object} connectionConfig - 连接配置
   * @param {Object} command - 命令配置
   */
  async executeCommand(deviceId, connectionConfig, command) {
    try {
      const connection = await this.createTcpConnection(connectionConfig);
      const connectionKey = `tcp_${connectionConfig.host}_${connectionConfig.port}_${connectionConfig.unitId}`;

      const { functionCode, address, value, values } = command;
      let result;

      switch (functionCode) {
        case 5: // 写入单个线圈
          result = await this.writeSingleCoil(connectionKey, address, Boolean(value));
          break;
        case 6: // 写入单个寄存器
          result = await this.writeSingleRegister(connectionKey, address, value);
          break;
        case 16: // 写入多个寄存器
          result = await this.writeMultipleRegisters(connectionKey, address, values);
          break;
        default:
          throw new Error(`不支持的命令功能码: ${functionCode}`);
      }

      logger.info(`成功执行设备命令: ${deviceId}`);
      return result;
    } catch (error) {
      logger.error(`执行设备命令失败: ${deviceId}, ${error.message}`);
      throw error;
    }
  }

  /**
   * 关闭连接
   * @param {string} connectionKey - 连接键
   */
  closeConnection(connectionKey) {
    const connection = this.connections.get(connectionKey);
    if (connection && connection.socket) {
      connection.socket.destroy();
      this.connections.delete(connectionKey);
      this.clients.delete(connectionKey);
      logger.info(`关闭Modbus连接: ${connectionKey}`);
    }
  }

  /**
   * 关闭所有连接
   */
  closeAllConnections() {
    for (const [key, connection] of this.connections) {
      if (connection.socket) {
        connection.socket.destroy();
      }
    }
    this.connections.clear();
    this.clients.clear();
    logger.info('关闭所有Modbus连接');
  }

  /**
   * 清理超时连接
   * @param {number} timeout - 超时时间（毫秒）
   */
  cleanupTimeoutConnections(timeout = 300000) { // 默认5分钟
    const now = Date.now();
    for (const [key, connection] of this.connections) {
      if (now - connection.lastUsed > timeout) {
        this.closeConnection(key);
        logger.info(`清理超时连接: ${key}`);
      }
    }
  }
}

module.exports = new ModbusService();