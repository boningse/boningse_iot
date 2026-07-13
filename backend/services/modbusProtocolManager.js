/**
 * Modbus 协议管理器
 * 统一管理 Modbus 设备的连接、数据读取和命令执行
 */

const ModbusService = require('./modbusService');
const ModbusParser = require('../utils/modbusParser');
const { Device, ProtocolConfig, DeviceData, DeviceCommand } = require('../models');
const logger = require('../utils/logger');

class ModbusProtocolManager {
  constructor() {
    this.connections = new Map(); // 存储设备连接
    this.parser = new ModbusParser();
    this.pollingIntervals = new Map(); // 存储轮询定时器
  }

  /**
   * 初始化 Modbus 设备
   * @param {Object} device - 设备信息
   * @param {Object} protocolConfig - 协议配置
   */
  async initializeDevice(device, protocolConfig) {
    try {
      const deviceKey = `${device.id}`;
      
      // 解析设备连接配置
      const connectionConfig = this.parseConnectionConfig(device);
      
      // 使用 Modbus 服务实例
      const modbusService = ModbusService;
      
      // 创建TCP连接
      await modbusService.createTcpConnection(connectionConfig);
      
      // 存储连接
      this.connections.set(deviceKey, {
        service: modbusService,
        device: device,
        protocolConfig: protocolConfig,
        lastRead: null,
        isConnected: true
      });
      
      // 启动数据轮询
      this.startDataPolling(deviceKey);
      
      logger.info(`Modbus device ${device.name} (${device.id}) initialized successfully`);
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Modbus device ${device.id}:`, error);
      throw error;
    }
  }

  /**
   * 解析设备连接配置
   * @param {Object} device - 设备信息
   */
  parseConnectionConfig(device) {
    const config = device.connection_config || {};
    
    return {
      host: config.host || device.ip_address || 'localhost',
      port: config.port || 502,
      unitId: device.address || config.unitId || 1, // 使用电表的地址作为从站地址
      timeout: config.timeout || 5000,
      reconnectInterval: config.reconnectInterval || 10000,
      maxRetries: config.maxRetries || 3
    };
  }

  /**
   * 启动数据轮询
   * @param {string} deviceKey - 设备键
   * @deprecated 电表数据轮询已迁移到ElectricMeterMqttService，此方法保留用于兼容性
   */
  startDataPolling(deviceKey) {
    const connection = this.connections.get(deviceKey);
    if (!connection) return;
    
    const { device, protocolConfig } = connection;
    
    // 注释：电表数据轮询已迁移到ElectricMeterMqttService
    // 现在电表通过MQTT连接而不是直接的Modbus TCP连接进行数据采集
    logger.info(`Device ${device.id} initialized, but data polling is now handled by ElectricMeterMqttService via MQTT`);
    
    // 保留原有逻辑但注释掉，以备将来需要时参考
    /*
    // 使用电表配置的采集频率（分钟转换为毫秒），如果未设置则使用默认值10分钟
    const collectionIntervalMinutes = device.collection_interval || 10;
    const pollingInterval = collectionIntervalMinutes * 60 * 1000; // 转换为毫秒
    
    // 清除现有定时器
    this.stopDataPolling(deviceKey);
    
    // 创建新的定时器
    const intervalId = setInterval(async () => {
      try {
        await this.readDeviceDataSequentially(deviceKey);
      } catch (error) {
        logger.error(`Error polling data for device ${device.id}:`, error);
        
        // 连接错误时尝试重连
        if (error.message.includes('connection') || error.message.includes('timeout')) {
          await this.reconnectDevice(deviceKey);
        }
      }
    }, pollingInterval);
    
    this.pollingIntervals.set(deviceKey, intervalId);
    
    logger.info(`Started data polling for device ${device.id} with interval ${pollingInterval}ms`);
    */
  }

  /**
   * 停止数据轮询
   * @param {string} deviceKey - 设备键
   */
  stopDataPolling(deviceKey) {
    const intervalId = this.pollingIntervals.get(deviceKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(deviceKey);
    }
  }

  /**
   * 按地址顺序间隔读取设备数据
   * @param {string} deviceKey - 设备键
   */
  async readDeviceDataSequentially(deviceKey) {
    const connection = this.connections.get(deviceKey);
    if (!connection || !connection.isConnected) {
      throw new Error(`Device ${deviceKey} is not connected`);
    }
    
    const { device } = connection;
    
    try {
      // 获取该设备下的所有电表，按地址排序
      const { ElectricMeter } = require('../models');
      const electricMeters = await ElectricMeter.findAll({
        where: { device_id: device.id, status: 'active' },
        include: [{
          model: require('../models').ProtocolConfig,
          as: 'protocol_config'
        }],
        order: [['meter_address', 'ASC']] // 按地址升序排列
      });
      
      if (!electricMeters || electricMeters.length === 0) {
        logger.warn(`No active electric meters found for device ${device.id}`);
        return;
      }
      
      logger.info(`Found ${electricMeters.length} electric meters for device ${device.id}, reading data sequentially`);
      
      // 按地址顺序逐个读取电表数据，间隔1秒
      for (let i = 0; i < electricMeters.length; i++) {
        const electricMeter = electricMeters[i];
        
        try {
          await this.readElectricMeterData(deviceKey, electricMeter);
          
          // 如果不是最后一个电表，等待1秒
          if (i < electricMeters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (error) {
          logger.error(`Failed to read data from electric meter ${electricMeter.meter_number}:`, error);
          // 继续处理下一个电表
        }
      }
      
      // 更新连接状态
      connection.lastRead = new Date();
      
      logger.debug(`Successfully completed sequential data reading for device ${device.id}`);
    } catch (error) {
      logger.error(`Failed to read device data sequentially for device ${device.id}:`, error);
      throw error;
    }
  }
  
  /**
   * 读取单个电表数据
   * @param {string} deviceKey - 设备键
   * @param {Object} electricMeter - 电表对象
   */
  async readElectricMeterData(deviceKey, electricMeter) {
    const connection = this.connections.get(deviceKey);
    if (!connection || !connection.isConnected) {
      throw new Error(`Device ${deviceKey} is not connected`);
    }
    
    const { service, device, protocolConfig } = connection;
    
    if (!protocolConfig) {
      throw new Error(`No protocol configuration found for device ${device.name}`);
    }
    
    const modbusConfig = protocolConfig.data_parsing_config?.modbus;
    if (!modbusConfig) {
      throw new Error(`No Modbus configuration found for electric meter ${electricMeter.meter_number}`);
    }
    
    // 临时修改服务的从站地址为电表地址
    const originalUnitId = service.unitId;
    service.unitId = parseInt(electricMeter.meter_address);
    
    const deviceData = {
      device_id: device.id,
      electric_meter_id: electricMeter.id,
      meter_number: electricMeter.meter_number,
      meter_address: electricMeter.meter_address,
      timestamp: new Date(),
      data: {},
      raw_data: {}
    };
    
    try {
      // 读取寄存器数据
      if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
        for (const register of protocolConfig.modbus_registers) {
          const rawData = await this.readRegisterData(service, register);
          deviceData.raw_data[`${register.function_code}_${register.address}`] = rawData;
          
          // 解析数据
          const parsedData = this.parseRegisterData(rawData, protocolConfig.modbus_registers, register);
          Object.assign(deviceData.data, parsedData);
        }
      }
      
      // 读取线圈数据
      if (modbusConfig.coils && modbusConfig.coils.length > 0) {
        const coilData = await this.readCoilData(service, modbusConfig.coils);
        Object.assign(deviceData.data, coilData);
      }
      
      // 保存数据到数据库并发布到MQTT
      await this.saveElectricMeterData(deviceData, electricMeter, protocolConfig);
      
      logger.debug(`Successfully read data from electric meter ${electricMeter.meter_number} (address: ${electricMeter.meter_address})`);
      
      return deviceData;
    } catch (error) {
      logger.error(`Failed to read data from electric meter ${electricMeter.meter_number}:`, error);
      throw error;
    } finally {
      // 恢复原始从站地址
      service.unitId = originalUnitId;
    }
  }
  
  /**
   * 读取设备数据（保留原方法用于兼容性）
   * @param {string} deviceKey - 设备键
   */
  async readDeviceData(deviceKey) {
    const connection = this.connections.get(deviceKey);
    if (!connection || !connection.isConnected) {
      throw new Error(`Device ${deviceKey} is not connected`);
    }
    
    const { service, device, protocolConfig } = connection;
    const modbusConfig = protocolConfig.data_parsing_config?.modbus;
    
    if (!modbusConfig) {
      throw new Error(`No Modbus configuration found for device ${device.id}`);
    }
    
    const deviceData = {
      device_id: device.id,
      timestamp: new Date(),
      data: {},
      raw_data: {}
    };
    
    try {
      // 读取寄存器数据
      if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
        for (const register of protocolConfig.modbus_registers) {
          const rawData = await this.readRegisterData(service, register);
          deviceData.raw_data[`${register.function_code}_${register.address}`] = rawData;
          
          // 解析数据
          const parsedData = this.parseRegisterData(rawData, protocolConfig.modbus_registers, register);
          Object.assign(deviceData.data, parsedData);
        }
      }
      
      // 读取线圈数据
      if (modbusConfig.coils && modbusConfig.coils.length > 0) {
        const coilData = await this.readCoilData(service, modbusConfig.coils);
        Object.assign(deviceData.data, coilData);
      }
      
      // 保存数据到数据库
      await this.saveDeviceData(deviceData);
      
      // 更新连接状态
      connection.lastRead = new Date();
      
      logger.debug(`Successfully read data from device ${device.id}`);
      
      return deviceData;
    } catch (error) {
      logger.error(`Failed to read data from device ${device.id}:`, error);
      throw error;
    }
  }

  /**
   * 读取寄存器数据
   * @param {ModbusService} service - Modbus 服务
   * @param {Object} register - 寄存器配置
   */
  async readRegisterData(service, register) {
    const { function_code, address, count } = register;
    const quantity = count || 1;
    
    switch (function_code) {
      case 1: // 读取线圈
        return await service.readCoils(address, quantity);
      case 2: // 读取离散输入
        return await service.readDiscreteInputs(address, quantity);
      case 3: // 读取保持寄存器
        return await service.readHoldingRegisters(address, quantity);
      case 4: // 读取输入寄存器
        return await service.readInputRegisters(address, quantity);
      default:
        throw new Error(`Unsupported function code: ${function_code}`);
    }
  }

  /**
   * 解析寄存器数据
   * @param {Array} rawData - 原始数据
   * @param {Array} registerConfigs - 寄存器配置
   * @param {Object} currentRegister - 当前寄存器配置
   */
  parseRegisterData(rawData, registerConfigs, currentRegister) {
    const parsedData = {};
    
    if (!registerConfigs || !Array.isArray(registerConfigs)) {
      return parsedData;
    }
    
    // 只解析当前寄存器的数据
    try {
      const value = this.parser.parseRegisterValue(rawData, currentRegister, 0);
      parsedData[currentRegister.name] = value;
    } catch (error) {
      logger.warn(`Failed to parse register ${currentRegister.name}:`, error);
    }
    
    return parsedData;
  }

  /**
   * 读取线圈数据
   * @param {ModbusService} service - Modbus 服务
   * @param {Array} coilConfigs - 线圈配置
   */
  async readCoilData(service, coilConfigs) {
    const coilData = {};
    
    // 按地址范围分组读取
    const addressRanges = this.groupCoilsByRange(coilConfigs);
    
    for (const range of addressRanges) {
      try {
        const rawData = await service.readCoils(range.startAddress, range.quantity);
        
        // 解析线圈数据
        for (const coilConfig of range.coils) {
          const relativeAddress = coilConfig.address - range.startAddress;
          coilData[coilConfig.name] = rawData[relativeAddress] || false;
        }
      } catch (error) {
        logger.warn(`Failed to read coil range ${range.startAddress}-${range.startAddress + range.quantity}:`, error);
      }
    }
    
    return coilData;
  }

  /**
   * 按地址范围分组线圈
   * @param {Array} coilConfigs - 线圈配置
   */
  groupCoilsByRange(coilConfigs) {
    const ranges = [];
    const sortedCoils = coilConfigs.sort((a, b) => a.address - b.address);
    
    let currentRange = null;
    
    for (const coil of sortedCoils) {
      if (!currentRange || coil.address > currentRange.endAddress + 1) {
        // 开始新的范围
        currentRange = {
          startAddress: coil.address,
          endAddress: coil.address,
          quantity: 1,
          coils: [coil]
        };
        ranges.push(currentRange);
      } else {
        // 扩展当前范围
        currentRange.endAddress = coil.address;
        currentRange.quantity = currentRange.endAddress - currentRange.startAddress + 1;
        currentRange.coils.push(coil);
      }
    }
    
    return ranges;
  }

  /**
   * 保存电表数据
   * @param {Object} deviceData - 设备数据
   * @param {Object} electricMeter - 电表对象
   * @param {Object} protocolConfig - 协议配置
   */
  async saveElectricMeterData(deviceData, electricMeter, protocolConfig) {
    try {
      // 保存到数据库
      await DeviceData.create({
        device_id: deviceData.device_id,
        timestamp: deviceData.timestamp,
        data: {
          ...deviceData.data,
          electric_meter_id: electricMeter.id,
          meter_number: electricMeter.meter_number,
          meter_address: electricMeter.meter_address
        },
        raw_data: deviceData.raw_data
      });
      
      // 发布数据到MQTT
      await this.publishElectricMeterDataToMqtt(deviceData, electricMeter, protocolConfig);
    } catch (error) {
      logger.error(`Failed to save electric meter data:`, error);
      throw error;
    }
  }
  
  /**
   * 保存设备数据（保留原方法用于兼容性）
   * @param {Object} deviceData - 设备数据
   */
  async saveDeviceData(deviceData) {
    try {
      // 保存到数据库
      await DeviceData.create({
        device_id: deviceData.device_id,
        timestamp: deviceData.timestamp,
        data: deviceData.data,
        raw_data: deviceData.raw_data
      });
      
      // 发布数据到MQTT
      await this.publishDataToMqtt(deviceData);
    } catch (error) {
      logger.error(`Failed to save device data:`, error);
      throw error;
    }
  }
  
  /**
   * 发布电表数据到MQTT
   * @param {Object} deviceData - 设备数据
   * @param {Object} electricMeter - 电表对象
   * @param {Object} protocolConfig - 协议配置
   */
  async publishElectricMeterDataToMqtt(deviceData, electricMeter, protocolConfig) {
    try {
      const deviceKey = `${deviceData.device_id}`;
      const connection = this.connections.get(deviceKey);
      
      if (!connection) {
        logger.warn(`No connection found for device ${deviceData.device_id}`);
        return;
      }
      
      const { device } = connection;
      const modbusConfig = protocolConfig.data_parsing_config?.modbus;
      
      // 获取MQTT发布主题
      let publishTopic = '';
      if (modbusConfig && modbusConfig.mqtt_topic_prefix) {
        // 使用协议配置中的发布主题
        publishTopic = modbusConfig.mqtt_topic_prefix;
      } else {
        // 使用设备的默认发布主题
        const deviceMqttConfig = device.mqtt_config || {};
        publishTopic = deviceMqttConfig.publish_topic || `zhhl/BNDK/${device.imei}/publish`;
      }
      
      // 准备发布的数据
      const publishData = {
        device_id: device.id,
        device_name: device.name,
        imei: device.imei,
        electric_meter_id: electricMeter.id,
        meter_number: electricMeter.meter_number,
        meter_address: electricMeter.meter_address,
        timestamp: deviceData.timestamp,
        data: deviceData.data,
        data_type: 'modbus_electric_meter'
      };
      
      // 获取MQTT服务实例
      const mqttService = global.mqttServiceInstance;
      if (mqttService && mqttService.isConnected) {
        await mqttService.client.publish(publishTopic, JSON.stringify(publishData), { qos: 1 });
        logger.debug(`Published electric meter data to MQTT topic: ${publishTopic}`, {
          deviceId: device.id,
          meterNumber: electricMeter.meter_number,
          meterAddress: electricMeter.meter_address,
          dataSize: JSON.stringify(publishData).length
        });
      } else {
        logger.warn('MQTT service not available, skipping electric meter data publish');
      }
    } catch (error) {
      logger.error(`Failed to publish electric meter data to MQTT:`, error);
      // 不抛出错误，避免影响数据保存
    }
  }
  
  /**
   * 发布数据到MQTT（保留原方法用于兼容性）
   * @param {Object} deviceData - 设备数据
   */
  async publishDataToMqtt(deviceData) {
    try {
      const deviceKey = `${deviceData.device_id}`;
      const connection = this.connections.get(deviceKey);
      
      if (!connection) {
        logger.warn(`No connection found for device ${deviceData.device_id}`);
        return;
      }
      
      const { device, protocolConfig } = connection;
      const modbusConfig = protocolConfig.data_parsing_config?.modbus;
      
      // 获取MQTT发布主题
      let publishTopic = '';
      if (modbusConfig && modbusConfig.mqtt_topic_prefix) {
        // 使用协议配置中的发布主题
        publishTopic = modbusConfig.mqtt_topic_prefix;
      } else {
        // 使用设备的默认发布主题
        const deviceMqttConfig = device.mqtt_config || {};
        publishTopic = deviceMqttConfig.publish_topic || `zhhl/BNDK/${device.imei}/publish`;
      }
      
      // 准备发布的数据
      const publishData = {
        device_id: device.id,
        device_name: device.name,
        imei: device.imei,
        timestamp: deviceData.timestamp,
        data: deviceData.data,
        data_type: 'modbus'
      };
      
      // 获取MQTT服务实例
      const mqttService = global.mqttServiceInstance;
      if (mqttService && mqttService.isConnected) {
        await mqttService.client.publish(publishTopic, JSON.stringify(publishData), { qos: 1 });
        logger.debug(`Published Modbus data to MQTT topic: ${publishTopic}`, {
          deviceId: device.id,
          dataSize: JSON.stringify(publishData).length
        });
      } else {
        logger.warn('MQTT service not available, skipping data publish');
      }
    } catch (error) {
      logger.error(`Failed to publish data to MQTT:`, error);
      // 不抛出错误，避免影响数据保存
    }
  }

  /**
   * 执行设备命令
   * @param {number} deviceId - 设备ID
   * @param {string} commandName - 命令名称
   * @param {*} value - 命令值
   * @param {Object} options - 选项
   */
  async executeCommand(deviceId, commandName, value, options = {}) {
    const deviceKey = `${deviceId}`;
    const connection = this.connections.get(deviceKey);
    
    if (!connection || !connection.isConnected) {
      throw new Error(`Device ${deviceId} is not connected`);
    }
    
    const { service, device, protocolConfig } = connection;
    const modbusConfig = protocolConfig.command_config?.modbus;
    
    if (!modbusConfig || !modbusConfig.commands) {
      throw new Error(`No Modbus command configuration found for device ${deviceId}`);
    }
    
    // 查找命令配置
    const commandConfig = modbusConfig.commands.find(cmd => cmd.name === commandName);
    if (!commandConfig) {
      throw new Error(`Command '${commandName}' not found for device ${deviceId}`);
    }
    
    try {
      // 验证命令值
      this.validateCommandValue(value, commandConfig);
      
      // 准备写入数据
      const writeData = this.parser.prepareWriteData(value, commandConfig);
      
      // 执行命令
      let result;
      switch (commandConfig.functionCode) {
        case 5: // 写入单个线圈
          result = await service.writeSingleCoil(commandConfig.address, writeData);
          break;
        case 6: // 写入单个寄存器
          result = await service.writeSingleRegister(commandConfig.address, writeData);
          break;
        case 15: // 写入多个线圈
          result = await service.writeMultipleCoils(commandConfig.address, writeData);
          break;
        case 16: // 写入多个寄存器
          result = await service.writeMultipleRegisters(commandConfig.address, writeData);
          break;
        default:
          throw new Error(`Unsupported command function code: ${commandConfig.functionCode}`);
      }
      
      // 记录命令执行
      await this.logCommand(deviceId, commandName, value, result, options);
      
      logger.info(`Command '${commandName}' executed successfully for device ${deviceId}`);
      
      return result;
    } catch (error) {
      logger.error(`Failed to execute command '${commandName}' for device ${deviceId}:`, error);
      
      // 记录命令失败
      await this.logCommand(deviceId, commandName, value, null, { ...options, error: error.message });
      
      throw error;
    }
  }

  /**
   * 验证命令值
   * @param {*} value - 命令值
   * @param {Object} commandConfig - 命令配置
   */
  validateCommandValue(value, commandConfig) {
    if (commandConfig.range) {
      const { min, max } = commandConfig.range;
      if (typeof value === 'number' && (value < min || value > max)) {
        throw new Error(`Command value ${value} is out of range [${min}, ${max}]`);
      }
    }
    
    if (commandConfig.dataType === 'boolean' && typeof value !== 'boolean') {
      throw new Error(`Command value must be boolean for dataType 'boolean'`);
    }
  }

  /**
   * 记录命令执行
   * @param {number} deviceId - 设备ID
   * @param {string} commandName - 命令名称
   * @param {*} value - 命令值
   * @param {*} result - 执行结果
   * @param {Object} options - 选项
   */
  async logCommand(deviceId, commandName, value, result, options = {}) {
    try {
      await DeviceCommand.create({
        device_id: deviceId,
        command_name: commandName,
        command_data: { value, ...options },
        status: result ? 'success' : 'failed',
        result: result,
        error_message: options.error,
        executed_by: options.userId,
        executed_at: new Date()
      });
    } catch (error) {
      logger.error(`Failed to log command execution:`, error);
    }
  }

  /**
   * 重连设备
   * @param {string} deviceKey - 设备键
   */
  async reconnectDevice(deviceKey) {
    const connection = this.connections.get(deviceKey);
    if (!connection) return;
    
    const { service, device } = connection;
    
    try {
      logger.info(`Attempting to reconnect device ${device.id}`);
      
      // 断开现有连接
      await service.disconnect();
      connection.isConnected = false;
      
      // 重新连接
      await service.connect();
      connection.isConnected = true;
      
      logger.info(`Device ${device.id} reconnected successfully`);
    } catch (error) {
      logger.error(`Failed to reconnect device ${device.id}:`, error);
      connection.isConnected = false;
    }
  }

  /**
   * 断开设备连接
   * @param {number} deviceId - 设备ID
   */
  async disconnectDevice(deviceId) {
    const deviceKey = `${deviceId}`;
    const connection = this.connections.get(deviceKey);
    
    if (connection) {
      // 停止数据轮询
      this.stopDataPolling(deviceKey);
      
      // 断开连接
      if (connection.service) {
        await connection.service.disconnect();
      }
      
      // 移除连接
      this.connections.delete(deviceKey);
      
      logger.info(`Device ${deviceId} disconnected`);
    }
  }

  /**
   * 获取设备连接状态
   * @param {number} deviceId - 设备ID
   */
  getDeviceStatus(deviceId) {
    const deviceKey = `${deviceId}`;
    const connection = this.connections.get(deviceKey);
    
    if (!connection) {
      return { connected: false, lastRead: null };
    }
    
    return {
      connected: connection.isConnected,
      lastRead: connection.lastRead
    };
  }

  /**
   * 获取所有连接的设备
   */
  getConnectedDevices() {
    const devices = [];
    
    for (const [deviceKey, connection] of this.connections) {
      devices.push({
        deviceId: connection.device.id,
        deviceName: connection.device.name,
        connected: connection.isConnected,
        lastRead: connection.lastRead
      });
    }
    
    return devices;
  }

  /**
   * 关闭所有连接
   */
  async shutdown() {
    logger.info('Shutting down Modbus Protocol Manager');
    
    const disconnectPromises = [];
    
    for (const deviceKey of this.connections.keys()) {
      const deviceId = parseInt(deviceKey);
      disconnectPromises.push(this.disconnectDevice(deviceId));
    }
    
    await Promise.all(disconnectPromises);
    
    logger.info('Modbus Protocol Manager shutdown complete');
  }
}

module.exports = ModbusProtocolManager;