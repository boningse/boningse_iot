/**
 * 设备轮询服务
 * 基于设备采集间隔，通过RTU报文查询电表数据
 */

const { Device, ElectricMeter, ProtocolConfig, DeviceData, Manufacturer } = require('../models');
const logger = require('../utils/logger');
const ModbusRtuUtils = require('../utils/modbusRtuUtils');
const electricMeterPollingConfig = require('../config/electricMeterPolling');
const WebSocketService = require('./websocketService');

class DevicePollingService {
  constructor() {
    this.pollingIntervals = new Map(); // 存储设备轮询定时器
    this.deviceElectricMeters = new Map(); // 缓存设备的电表列表
    this.mqttService = null; // MQTT服务实例
  }

  /**
   * 初始化服务
   */
  async initialize() {
    try {
      // 获取MQTT服务实例
      this.mqttService = global.mqttServiceInstance;
      if (!this.mqttService) {
        throw new Error('MQTT服务未初始化');
      }

      logger.info('设备轮询服务初始化成功');
      
      // 注释：禁用自动启动，避免与ElectricMeterMqttService重复轮询
      // 延迟启动，等待系统完全初始化
      // setTimeout(() => {
      //   this.startAllDevicePolling();
      // }, 15000); // 15秒延迟
      
      logger.info('设备轮询服务自动启动已禁用，避免与电表MQTT服务重复轮询');
      
    } catch (error) {
      logger.error('设备轮询服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 启动所有设备的轮询
   */
  async startAllDevicePolling() {
    try {
      logger.info('开始启动所有设备的轮询...');

      // 查找所有有电表的设备
      const devicesWithMeters = await this.findDevicesWithElectricMeters();
      
      if (devicesWithMeters.length === 0) {
        logger.info('未找到配置电表的设备');
        return;
      }

      logger.info(`找到 ${devicesWithMeters.length} 个配置了电表的设备，开始启动轮询...`);

      // 为每个设备启动轮询
      for (const device of devicesWithMeters) {
        await this.startDevicePolling(device);
        // 设备间启动间隔，避免同时启动造成负载
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      logger.info('所有设备轮询启动完成');
    } catch (error) {
      logger.error('启动设备轮询失败:', error);
    }
  }

  /**
   * 查找所有配置了电表的设备
   */
  async findDevicesWithElectricMeters() {
    try {
      // 查找有活跃电表的设备，电表需要配置协议
      const devices = await Device.findAll({
        attributes: {
          exclude: ['device_category']  // 排除有问题的字段
        },
        include: [
          {
            model: ElectricMeter,
            as: 'electric_meters',
            where: { status: 'active' },
            required: true, // 必须有电表
            include: [
              {
                model: ProtocolConfig,
                as: 'protocol_config',
                where: { 
                  protocol_type: 'modbus',
                  status: 'active' 
                },
                required: true // 电表必须配置Modbus协议
              }
            ]
          },
          {
            model: Manufacturer,
            as: 'manufacturer',
            required: false, // 厂商信息可选
            attributes: ['id', 'code', 'name', 'subscription_type'] // 只获取需要的字段
          }
        ],
        where: {
          status: ['active', 'online']
        }
      });

      return devices.filter(device => device.electric_meters && device.electric_meters.length > 0);
    } catch (error) {
      logger.error('查找配置电表的设备失败:', error);
      return [];
    }
  }

  /**
   * 启动单个设备的轮询
   * @param {Object} device - 设备对象
   */
  async startDevicePolling(device) {
    try {
      const deviceKey = `${device.id}`;
      
      // 停止现有轮询
      this.stopDevicePolling(deviceKey);

      // 缓存设备的电表列表
      this.deviceElectricMeters.set(deviceKey, device.electric_meters);

      // 获取设备的采集间隔（分钟），默认10分钟
      const collectionIntervalMinutes = device.collection_interval || 10;
      const pollingInterval = collectionIntervalMinutes * 60 * 1000; // 转换为毫秒

      // 创建轮询定时器
      const intervalId = setInterval(async () => {
        try {
          await this.pollDeviceElectricMeters(device);
        } catch (error) {
          logger.error(`设备 ${device.id} 轮询失败:`, error);
        }
      }, pollingInterval);

      this.pollingIntervals.set(deviceKey, intervalId);
      
      logger.info(`设备 ${device.name} (${device.id}) 轮询已启动`, {
        deviceId: device.id,
        meterCount: device.electric_meters.length,
        pollingInterval: `${collectionIntervalMinutes}分钟`
      });

      // 立即执行一次轮询
      setTimeout(() => {
        this.pollDeviceElectricMeters(device);
      }, 5000); // 5秒后执行第一次轮询

    } catch (error) {
      logger.error(`启动设备 ${device.id} 轮询失败:`, error);
    }
  }

  /**
   * 停止设备轮询
   * @param {string} deviceKey - 设备键
   */
  stopDevicePolling(deviceKey) {
    const intervalId = this.pollingIntervals.get(deviceKey);
    if (intervalId) {
      clearInterval(intervalId);
      this.pollingIntervals.delete(deviceKey);
      this.deviceElectricMeters.delete(deviceKey);
      logger.info(`设备 ${deviceKey} 轮询已停止`);
    }
  }

  /**
   * 停止所有轮询
   */
  stopAllPolling() {
    for (const [deviceKey, intervalId] of this.pollingIntervals) {
      clearInterval(intervalId);
      logger.info(`设备 ${deviceKey} 轮询已停止`);
    }
    this.pollingIntervals.clear();
    this.deviceElectricMeters.clear();
    logger.info('所有设备轮询已停止');
  }

  /**
   * 轮询设备的所有电表数据
   * @param {Object} device - 设备对象
   */
  async pollDeviceElectricMeters(device) {
    try {
      const electricMeters = this.deviceElectricMeters.get(`${device.id}`) || device.electric_meters;
      
      if (!electricMeters || electricMeters.length === 0) {
        logger.warn(`设备 ${device.id} 没有配置电表`);
        return;
      }

      logger.debug(`开始轮询设备 ${device.name} 的 ${electricMeters.length} 个电表 (RTU格式)`);

      // 按电表地址顺序轮询
      const sortedMeters = electricMeters.sort((a, b) => 
        parseInt(a.meter_address) - parseInt(b.meter_address)
      );

      for (let i = 0; i < sortedMeters.length; i++) {
        const electricMeter = sortedMeters[i];
        
        try {
          await this.pollSingleElectricMeter(device, electricMeter);
          
          // 电表间轮询间隔，避免冲突
          if (i < sortedMeters.length - 1) {
            await new Promise(resolve => setTimeout(resolve, electricMeterPollingConfig.commandIntervals.betweenMeters));
          }
        } catch (error) {
          logger.error(`轮询电表 ${electricMeter.meter_number} 失败:`, error);
          // 继续处理下一个电表
        }
      }

      logger.debug(`设备 ${device.name} 电表轮询完成 (RTU格式)`);
    } catch (error) {
      logger.error(`设备 ${device.id} 电表轮询失败:`, error);
    }
  }

  /**
   * 轮询单个电表数据
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   */
  async pollSingleElectricMeter(device, electricMeter) {
    try {
      // 使用电表的协议配置
      const protocolConfig = electricMeter.protocol_config;
      if (!protocolConfig) {
        throw new Error(`电表 ${electricMeter.meter_number} 缺少协议配置`);
      }

      // 检查modbus_registers字段
      if (!protocolConfig.modbus_registers || !Array.isArray(protocolConfig.modbus_registers)) {
        throw new Error(`电表 ${electricMeter.meter_number} 的协议配置缺少modbus_registers`);
      }

      // 构造RTU格式的Modbus查询命令
      const rtuCommand = this.buildRtuCommand(electricMeter, protocolConfig);
      
      // 通过MQTT发布RTU查询命令
      await this.publishRtuCommand(device, electricMeter, rtuCommand);
      
      logger.debug(`已发送电表 ${electricMeter.meter_number} 的RTU查询命令`);
      
    } catch (error) {
      logger.error(`轮询电表 ${electricMeter.meter_number} 失败:`, error);
      throw error;
    }
  }

  /**
   * 构造RTU格式的Modbus查询命令
   * @param {Object} electricMeter - 电表对象
   * @param {Object} modbusConfig - Modbus配置
   */
  buildRtuCommand(electricMeter, protocolConfig) {
    const meterAddress = parseInt(electricMeter.meter_address);
    
    const command = {
      type: 'modbus_rtu_query',
      meter_address: meterAddress,
      meter_id: electricMeter.id,
      meter_number: electricMeter.meter_number,
      timestamp: new Date().toISOString(),
      format: 'rtu',
      rtu_commands: []
    };

    // 根据协议配置的modbus_registers构造RTU查询
    if (protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
      for (const register of protocolConfig.modbus_registers) {
        try {
          let rtuBuffer;
          
          switch (register.function_code) {
            case 3: // 读取保持寄存器
              rtuBuffer = ModbusRtuUtils.buildReadHoldingRegistersRTU(
                meterAddress,
                register.address,
                register.count || 1
              );
              break;
            case 4: // 读取输入寄存器
              rtuBuffer = ModbusRtuUtils.buildReadInputRegistersRTU(
                meterAddress,
                register.address,
                register.count || 1
              );
              break;
            default:
              logger.warn(`不支持的RTU功能码: ${register.function_code}`);
              continue;
          }
          
          if (rtuBuffer) {
            const hexString = ModbusRtuUtils.bufferToHexString(rtuBuffer);
            command.rtu_commands.push({
              register_name: register.name || register.description || `register_${register.address}`,
              description: register.description || `读取地址${register.address}`,
              function_code: register.function_code,
              start_address: register.address,
              count: register.count || 1,
              quantity: register.count || 1,
              hex_command: hexString,
              raw_bytes: Array.from(rtuBuffer)
            });
            
            logger.debug(`生成RTU指令: ${hexString}`, {
              meterAddress,
              functionCode: register.function_code,
              startAddress: register.address,
              quantity: register.count
            });
          }
        } catch (error) {
          logger.error(`生成RTU指令失败:`, error);
        }
      }
    }

    return command;
  }

  /**
   * 构造设备命令主题
   * @param {Object} device - 设备对象
   */
  buildCommandTopic(device) {
    try {
      // 优先使用设备的MQTT配置
      const deviceMqttConfig = device.mqtt_config || {};
      
      // 优先使用command_topic字段
      if (deviceMqttConfig.command_topic) {
        return deviceMqttConfig.command_topic;
      }
      
      // 从subscribe_topics数组中查找命令主题
      if (deviceMqttConfig.subscribe_topics && Array.isArray(deviceMqttConfig.subscribe_topics)) {
        const commandTopic = deviceMqttConfig.subscribe_topics.find(topic => 
          (topic.description && (topic.description.includes('命令') || topic.description.includes('command'))) ||
          (topic.topic && topic.topic.includes('subscribe'))
        );
        
        if (commandTopic && commandTopic.topic) {
          return commandTopic.topic;
        }
      }
      
      // 根据厂商的subscription_type构建主题
      const manufacturerCode = device.manufacturer_code || 'BNDK';
      const subscriptionType = device.manufacturer?.subscription_type || 'imei_middle';
      
      // 根据厂商的订阅类型构建主题
      if (subscriptionType === 'imei_middle') {
        return `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
      } else if (subscriptionType === 'imei_last') {
        return `zhhl/${manufacturerCode}/subscribe/${device.imei}`;
      }
      
      // 默认命令主题格式
      return `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
      
    } catch (error) {
      logger.error('构造命令主题失败:', error);
      // 返回默认格式
      const manufacturerCode = device.manufacturer_code || 'BNDK';
      return `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
    }
  }

  /**
   * 通过MQTT发布RTU查询命令
   * @param {Object} device - 设备对象
   * @param {Object} electricMeter - 电表对象
   * @param {Object} rtuCommand - RTU命令
   */
  async publishRtuCommand(device, electricMeter, rtuCommand) {
    try {
      if (!this.mqttService || !this.mqttService.isConnected) {
        throw new Error('MQTT服务未连接');
      }

      // 构造MQTT主题（根据厂商配置）
      const topic = this.buildCommandTopic(device);
      
      // 记录命令发送开始日志
      logger.info(`开始发送设备轮询RTU命令`, {
        deviceId: device.id,
        deviceName: device.name,
        deviceImei: device.imei,
        manufacturerCode: device.manufacturer_code,
        meterNumber: electricMeter.meter_number,
        meterAddress: electricMeter.meter_address,
        commandTopic: topic,
        commandCount: rtuCommand.rtu_commands ? rtuCommand.rtu_commands.length : 0
      });
      
      // 发布RTU命令 - 直接发送十六进制字符串
      if (rtuCommand.rtu_commands && rtuCommand.rtu_commands.length > 0) {
        // 取第一个RTU命令的十六进制字符串
        const hexCommand = rtuCommand.rtu_commands[0].hex_command;
        const rtuCmd = rtuCommand.rtu_commands[0];
        
        // 将十六进制字符串转换为Buffer并发布
        const ModbusRtuUtils = require('../utils/modbusRtuUtils');
        const commandBuffer = ModbusRtuUtils.hexStringToBuffer(hexCommand);
        await this.mqttService.client.publish(topic, commandBuffer, { qos: 0 });
        
        // 增强的日志记录，包含主题和详细信息
        logger.info(`设备轮询RTU命令已发布`, {
          主题: topic,
          内容: hexCommand,
          描述: rtuCmd.description || rtuCmd.register_name,
          设备IMEI: device.imei,
          设备名称: device.name,
          厂商代码: device.manufacturer_code,
          电表号: electricMeter.meter_number,
          电表地址: electricMeter.meter_address,
          功能码: rtuCmd.function_code,
          起始地址: `0x${rtuCmd.start_address.toString(16).toUpperCase().padStart(4, '0')}`,
          寄存器数量: rtuCmd.count,
          QoS: 0
        });
        
        // 同时保持原有的简洁日志格式
        logger.info(`RTU命令已发布到MQTT: ${hexCommand}`);
        
      } else {
        throw new Error('RTU命令为空');
      }
      
    } catch (error) {
      logger.error('发布RTU命令失败', {
        deviceId: device.id,
        deviceImei: device.imei,
        deviceName: device.name,
        meterNumber: electricMeter.meter_number,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * 重新加载设备配置
   * @param {string} deviceId - 设备ID
   */
  async reloadDeviceConfig(deviceId) {
    try {
      // 停止现有轮询
      this.stopDevicePolling(deviceId);
      
      // 重新查找设备配置
      const device = await Device.findOne({
        where: { id: deviceId },
        include: [{
          model: ElectricMeter,
          as: 'electric_meters',
          where: { status: 'active' },
          include: [{
            model: ProtocolConfig,
            as: 'protocol_config',
            where: { 
              protocol_type: 'modbus',
              status: 'active' 
            }
          }]
        }]
      });
      
      if (device && device.electric_meters && device.electric_meters.length > 0) {
        await this.startDevicePolling(device);
        logger.info(`设备 ${deviceId} 配置已重新加载并启动轮询`);
      } else {
        logger.warn(`设备 ${deviceId} 没有有效的电表配置`);
      }
      
    } catch (error) {
      logger.error(`重新加载设备 ${deviceId} 配置失败:`, error);
      throw error;
    }
  }

  /**
   * 获取轮询状态
   */
  getPollingStatus() {
    const status = {
      totalDevices: this.pollingIntervals.size,
      activePolling: [],
      timestamp: new Date().toISOString()
    };
    
    for (const [deviceKey, intervalId] of this.pollingIntervals) {
      const cachedMeters = this.deviceElectricMeters.get(deviceKey);
      status.activePolling.push({
        deviceId: deviceKey,
        meterCount: cachedMeters ? cachedMeters.length : 0,
        isActive: !!intervalId
      });
    }
    
    return status;
  }
}

module.exports = DevicePollingService;