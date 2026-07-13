const logger = require('../utils/logger');
const { Device, DeviceData, ElectricMeter } = require('../models');
const mqttService = require('./mqttService');
const electricMeterDataService = require('./electricMeterDataService');

class DtuGatewayService {
  constructor() {
    this.connectedDtus = new Map();
    this.isInitialized = false;
    this.mqttService = mqttService; // 设置MQTT服务实例
  }
  
  /**
   * 设置MQTT消息处理器
   */
  setupMqttMessageHandler() {
    if (!this.mqttService || !this.mqttService.client) {
      logger.error('MQTT客户端未初始化，无法设置DTU消息处理器');
      return;
    }

    // 注册DTU消息处理器到消息处理服务
    if (this.mqttService.messageProcessingService) {
      this.mqttService.messageProcessingService.registerDtuMessageHandler(
        this.handleDtuMessage.bind(this)
      );
      logger.info('DTU消息处理器已注册到消息处理服务');
    } else {
      logger.error('消息处理服务未找到，无法注册DTU消息处理器');
    }
  }

  /**
   * 初始化DTU网关服务
   */
  async initialize() {
    try {
      logger.info('正在初始化DTU网关服务...');
      
      // 延迟设置MQTT消息处理器，等待MQTT客户端初始化完成
      setTimeout(() => {
        this.setupMqttMessageHandler();
      }, 3000);
      
      // 加载已配置的DTU设备
      await this.loadDtuDevices();
      
      this.isInitialized = true;
      logger.info('DTU网关服务初始化完成');
    } catch (error) {
      logger.error('DTU网关服务初始化失败:', error);
      throw error;
    }
  }

  /**
   * 加载DTU设备
   */
  async loadDtuDevices() {
    try {
      const dtuDevices = await Device.findAll({
        where: {
          device_category: 'gateway'
        },
        include: [{
          model: Device,
          as: 'SubDevices',
          where: { device_category: 'sub_device' },
          required: false
        }]
      });

      for (const dtu of dtuDevices) {
        this.connectedDtus.set(dtu.imei, {
          device: dtu,
          lastSeen: null,
          subDevices: dtu.SubDevices || []
        });
      }

      logger.info(`已加载 ${dtuDevices.length} 个DTU设备`);
    } catch (error) {
      logger.error('加载DTU设备失败:', error);
      throw error;
    }
  }

  /**
   * 处理DTU消息
   */
  async handleDtuMessage(topic, message) {
    try {
      const topicInfo = this.parseTopicInfo(topic);
      if (!topicInfo) {
        logger.warn(`无效的主题格式: ${topic}`);
        return;
      }

      const { manufacturerCode, imei } = topicInfo;
      const dtuInfo = this.connectedDtus.get(imei);
      
      if (!dtuInfo) {
        logger.warn(`未找到DTU设备: ${imei}`);
        return;
      }

      // 解析消息
      let payload;
      try {
        payload = JSON.parse(message.toString());
      } catch (error) {
        logger.error(`解析DTU消息失败: ${error.message}`);
        return;
      }

      // 更新DTU最后在线时间
      dtuInfo.lastSeen = new Date();
      await this.updateDtuStatus(dtuInfo.device, 'online');

      // 根据消息类型处理
      switch (payload.type) {
        case 'modbus_data':
          await this.handleModbusData(dtuInfo, payload);
          break;
        case 'heartbeat':
          await this.handleHeartbeat(dtuInfo, payload);
          break;
        case 'command_response':
          await this.handleCommandResponse(dtuInfo, payload);
          break;
        default:
          logger.warn(`未知的消息类型: ${payload.type}`);
      }

    } catch (error) {
      logger.error('处理DTU消息失败:', error);
    }
  }

  /**
   * 解析主题信息
   */
  parseTopicInfo(topic) {
    const parts = topic.split('/');
    if (parts.length !== 4 || parts[0] !== 'zhhl' || parts[3] !== 'publish') {
      return null;
    }

    return {
      manufacturerCode: parts[1],
      imei: parts[2]
    };
  }

  /**
   * 处理Modbus数据
   */
  async handleModbusData(dtuInfo, payload) {
    try {
      if (!payload.data || !Array.isArray(payload.data)) {
        logger.warn('无效的Modbus数据格式');
        return;
      }

      for (const modbusData of payload.data) {
        const { meter_address, function_code, start_address, registers } = modbusData;
        
        // 查找对应的电表设备
        const electricMeter = await this.findElectricMeterByAddress(
          dtuInfo.device.id, 
          meter_address
        );

        if (!electricMeter) {
          logger.warn(`未找到电表: DTU=${dtuInfo.device.id}, Address=${meter_address}`);
          continue;
        }

        // 处理电表数据
        // 确保timestamp是有效的时间戳
        let validTimestamp;
        if (payload.timestamp) {
          const parsedTimestamp = new Date(payload.timestamp);
          if (isNaN(parsedTimestamp.getTime())) {
            logger.warn(`无效的timestamp值: ${payload.timestamp}，使用当前时间`);
            validTimestamp = Date.now();
          } else {
            validTimestamp = parsedTimestamp.getTime();
          }
        } else {
          validTimestamp = Date.now();
        }
        
        await electricMeterDataService.processElectricMeterData(
          electricMeter,
          {
            function_code,
            start_address,
            registers,
            timestamp: validTimestamp
          }
        );
      }
    } catch (error) {
      logger.error('处理Modbus数据失败:', error);
    }
  }

  /**
   * 处理心跳消息
   */
  async handleHeartbeat(dtuInfo, payload) {
    try {
      logger.debug(`收到DTU心跳: ${dtuInfo.device.imei}`);
      
      // 更新设备状态
      await this.updateDtuStatus(dtuInfo.device, 'online');
      
      // 如果有子设备状态信息，更新子设备状态
      if (payload.sub_devices) {
        for (const subDeviceStatus of payload.sub_devices) {
          await this.updateSubDeviceStatus(
            dtuInfo.device.id,
            subDeviceStatus.address,
            subDeviceStatus.status
          );
        }
      }
    } catch (error) {
      logger.error('处理心跳消息失败:', error);
    }
  }

  /**
   * 处理命令响应
   */
  async handleCommandResponse(dtuInfo, payload) {
    try {
      logger.info(`收到命令响应: DTU=${dtuInfo.device.imei}, CommandID=${payload.command_id}`);
      
      // 这里可以实现命令响应的处理逻辑
      // 比如更新命令状态、通知前端等
    } catch (error) {
      logger.error('处理命令响应失败:', error);
    }
  }

  /**
   * 查找电表设备
   */
  async findElectricMeterByAddress(dtuDeviceId, meterAddress) {
    try {
      return await ElectricMeter.findOne({
        where: {
          dtu_device_id: dtuDeviceId,
          meter_address: meterAddress
        },
        include: [{
          model: Device,
          as: 'Device'
        }]
      });
    } catch (error) {
      logger.error('查找电表设备失败:', error);
      return null;
    }
  }

  /**
   * 更新DTU状态
   */
  async updateDtuStatus(dtuDevice, status) {
    try {
      await Device.update(
        {
          status: status,
          last_seen_at: new Date()
        },
        {
          where: { id: dtuDevice.id }
        }
      );
    } catch (error) {
      logger.error('更新DTU状态失败:', error);
    }
  }

  /**
   * 更新子设备状态
   */
  async updateSubDeviceStatus(dtuDeviceId, meterAddress, status) {
    try {
      const electricMeter = await this.findElectricMeterByAddress(dtuDeviceId, meterAddress);
      if (electricMeter && electricMeter.Device) {
        await Device.update(
          {
            status: status,
            last_seen_at: new Date()
          },
          {
            where: { id: electricMeter.Device.id }
          }
        );
      }
    } catch (error) {
      logger.error('更新子设备状态失败:', error);
    }
  }

  /**
   * 向DTU发送Modbus命令
   */
  async sendModbusCommand(dtuImei, meterAddress, command) {
    try {
      const dtuInfo = this.connectedDtus.get(dtuImei);
      if (!dtuInfo) {
        throw new Error(`DTU设备不存在: ${dtuImei}`);
      }

      const topic = `zhhl/${dtuInfo.device.manufacturer_code}/${dtuImei}/command`;
      const payload = {
        type: 'modbus_command',
        command_id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        meter_address: meterAddress,
        function_code: command.function_code,
        address: command.address,
        value: command.value,
        timestamp: Date.now()
      };

      await mqttService.publish(topic, JSON.stringify(payload));
      logger.info(`已发送Modbus命令: DTU=${dtuImei}, Command=${payload.command_id}`);
      
      return payload.command_id;
    } catch (error) {
      logger.error('发送Modbus命令失败:', error);
      throw error;
    }
  }

  /**
   * 获取DTU设备列表
   */
  getDtuDevices() {
    return Array.from(this.connectedDtus.values()).map(dtuInfo => ({
      device: dtuInfo.device,
      lastSeen: dtuInfo.lastSeen,
      subDeviceCount: dtuInfo.subDevices.length,
      isOnline: dtuInfo.lastSeen && (Date.now() - dtuInfo.lastSeen.getTime()) < 300000 // 5分钟
    }));
  }

  /**
   * 获取DTU的子设备
   */
  getDtuSubDevices(dtuImei) {
    const dtuInfo = this.connectedDtus.get(dtuImei);
    return dtuInfo ? dtuInfo.subDevices : [];
  }
}

module.exports = new DtuGatewayService();