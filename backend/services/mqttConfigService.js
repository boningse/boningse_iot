const { Device, DeviceType, MqttConfig, Tenant } = require('../models');
const logger = require('../utils/logger');

class MqttConfigService {
  constructor() {
    this.deviceConfigs = new Map(); // 缓存设备MQTT配置
  }

  /**
   * 获取设备的MQTT配置
   * @param {string} deviceId - 设备ID
   * @returns {Object} MQTT配置
   */
  async getDeviceConfig(deviceId) {
    try {
      // 先从缓存获取
      if (this.deviceConfigs.has(deviceId)) {
        return this.deviceConfigs.get(deviceId);
      }

      // 从数据库获取
      const device = await Device.findOne({
        where: { device_id: deviceId },
        include: [{
          model: DeviceType,
          as: 'device_type'
        }, {
          model: require('../models').Manufacturer,
          as: 'manufacturer'
        }, {
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'name', 'device_id', 'imei', 'device_category'],
          required: false
        }]
      });

      if (!device) {
        throw new Error(`设备 ${deviceId} 不存在`);
      }

      // 优先使用数据库中保存的mqtt_config，如果不存在或为空才生成默认配置
      let config;
      if (device.mqtt_config && Object.keys(device.mqtt_config).length > 0) {
        // 使用数据库中已保存的配置
        config = device.mqtt_config;
      } else {
        // 生成默认配置
        config = this.buildDeviceConfig(device);
      }

      // 缓存配置
      this.deviceConfigs.set(deviceId, config);

      return config;
    } catch (error) {
      logger.error('获取设备MQTT配置失败:', error);
      throw error;
    }
  }

  /**
   * 构建设备MQTT配置
   * @param {Object} device - 设备对象
   * @returns {Object} 构建的配置
   */
  buildDeviceConfig(device) {
    const communicationDevice = device.device_category === 'sub_device' && device.parent_device
      ? device.parent_device
      : device;
    const deviceId = communicationDevice.device_id || communicationDevice.imei;
    const imei = communicationDevice.imei || communicationDevice.device_id;
    const manufacturerCode = device.manufacturer?.code || 'UNKNOWN';
    const mqttConfig = device.mqtt_config || {};
    const renderTopic = (topic) => String(topic || '')
      .replace(/\{imei\}|\{IMEI\}/g, imei || '')
      .replace(/\{deviceId\}|\{device_id\}/g, deviceId || '')
      .replace(/\{manufacturerCode\}|\{manufacturer\}|\{code\}/g, manufacturerCode);
    
    // 获取厂商的订阅类型配置
    const subscriptionType = device.manufacturer?.subscription_type || 'imei_middle';
    
    // 根据厂商配置生成主题
    let subscribeTopics = [];
    let publishTopics = [];
    
    if (imei && manufacturerCode !== 'UNKNOWN') {
      if (subscriptionType === 'imei_middle') {
        // IMEI在中间：zhhl/{厂商编号}/{IMEI}/subscribe
        subscribeTopics.push({
          topic: `zhhl/${manufacturerCode}/${imei}/subscribe`,
          qos: 1,
          description: '接收命令(IMEI在中间格式)'
        });
        publishTopics.push({
          topic: `zhhl/${manufacturerCode}/${imei}/publish`,
          qos: 1,
          description: '发送数据(IMEI在中间格式)',
          data_type: 'sensor_data'
        });
      } else if (subscriptionType === "custom") {
        const mfgConfig = device.manufacturer?.mqtt_config || {};
        const mSubs = mfgConfig.subscribeTopics || mfgConfig.subscribe_topics || [];
        const mPubs = mfgConfig.publishTopics || mfgConfig.publish_topics || [];
        subscribeTopics = mSubs.map((topic) => (
          typeof topic === 'string'
            ? { topic: renderTopic(topic), qos: 1 }
            : { ...topic, topic: renderTopic(topic.topic) }
        ));
        publishTopics = mPubs.map((topic) => (
          typeof topic === 'string'
            ? { topic: renderTopic(topic), qos: 1 }
            : { ...topic, topic: renderTopic(topic.topic) }
        ));
      } else if (subscriptionType === 'imei_last') {
        // IMEI在最后：zhhl/{厂商编号}/subscribe/{IMEI}
        subscribeTopics.push({
          topic: `zhhl/${manufacturerCode}/subscribe/${imei}`,
          qos: 1,
          description: '接收命令(IMEI在最后格式)'
        });
        publishTopics.push({
          topic: `zhhl/${manufacturerCode}/publish/${imei}`,
          qos: 1,
          description: '发送数据(IMEI在最后格式)',
          data_type: 'sensor_data'
        });
      }
    } else {
      // 兼容旧格式或无厂商信息的设备
      subscribeTopics.push({
        topic: `device/${deviceId}/command`,
        qos: 1,
        description: '接收命令(兼容格式)'
      });
      publishTopics.push({
        topic: `device/${deviceId}/data`,
        qos: 1,
        description: '发送数据(兼容格式)',
        data_type: 'sensor_data'
      });
    }
    
    // 简化配置：只保留核心主题
    // 可选：添加心跳主题用于设备在线状态监控
    
    publishTopics.push({
      topic: `device/${deviceId}/heartbeat`,
      qos: 0,
      description: '心跳',
      data_type: 'heartbeat'
    });

    // 默认配置
    const defaultConfig = {
      subscribe_topics: subscribeTopics,
      publish_topics: publishTopics,
      heartbeat_interval: 60,
      offline_timeout: 300,
      auto_subscribe: true,
      enabled: true
    };

    // 合并用户配置和默认配置
    const config = {
      ...defaultConfig,
      ...mqttConfig
    };


    return config;
  }

  /**
   * 更新设备MQTT配置
   * @param {string} deviceId - 设备ID
   * @param {Object} config - 新的配置
   */
  async updateDeviceConfig(deviceId, config) {
    try {
      const device = await Device.findOne({
        where: { device_id: deviceId }
      });

      if (!device) {
        throw new Error(`设备 ${deviceId} 不存在`);
      }

      // 验证配置格式
      this.validateConfig(config);

      // 更新数据库
      await device.update({
        mqtt_config: config
      });

      // 更新缓存
      const fullConfig = this.buildDeviceConfig({
        ...device.toJSON(),
        mqtt_config: config
      });
      this.deviceConfigs.set(deviceId, fullConfig);

      logger.info(`设备 ${deviceId} MQTT配置已更新`);

      return fullConfig;
    } catch (error) {
      logger.error('更新设备MQTT配置失败:', error);
      throw error;
    }
  }

  /**
   * 验证MQTT配置格式
   * @param {Object} config - 配置对象
   */
  validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('配置必须是一个对象');
    }

    // 验证订阅主题
    if (config.subscribe_topics && !Array.isArray(config.subscribe_topics)) {
      throw new Error('subscribe_topics 必须是数组');
    }

    // 验证发布主题
    if (config.publish_topics && !Array.isArray(config.publish_topics)) {
      throw new Error('publish_topics 必须是数组');
    }

    // 验证心跳间隔
    if (config.heartbeat_interval && (typeof config.heartbeat_interval !== 'number' || config.heartbeat_interval < 10)) {
      throw new Error('heartbeat_interval 必须是大于等于10的数字');
    }

    // 验证离线超时
    if (config.offline_timeout && (typeof config.offline_timeout !== 'number' || config.offline_timeout < 60)) {
      throw new Error('offline_timeout 必须是大于等于60的数字');
    }
  }

  /**
   * 清除设备配置缓存
   * @param {string} deviceId - 设备ID
   */
  clearDeviceCache(deviceId) {
    if (this.deviceConfigs.has(deviceId)) {
      this.deviceConfigs.delete(deviceId);
      logger.info(`设备 ${deviceId} 的MQTT配置缓存已清除`);
    }
  }

  /**
   * 获取设备的订阅主题列表
   * @param {string} deviceId - 设备ID
   * @returns {Array} 订阅主题列表
   */
  async getDeviceSubscribeTopics(deviceId) {
    const config = await this.getDeviceConfig(deviceId);
    return config.subscribe_topics || [];
  }

  /**
   * 获取设备的发布主题列表
   * @param {string} deviceId - 设备ID
   * @returns {Array} 发布主题列表
   */
  async getDevicePublishTopics(deviceId) {
    const config = await this.getDeviceConfig(deviceId);
    return config.publish_topics || [];
  }

  /**
   * 根据主题获取设备ID
   * @param {string} topic - MQTT主题
   * @returns {string|null} 设备ID
   */
  extractDeviceIdFromTopic(topic) {
    // 支持动态厂商编号的两种格式和兼容旧格式
    const parts = topic.split('/');

    // 第一种格式: zhhl/{厂商编号}/{IMEI}/publish
    if (parts.length >= 4 && parts[0] === 'zhhl' && parts[3] === 'publish') {
      return parts[2]; // 返回IMEI
    }

    // 第二种格式: zhhl/{厂商编号}/publish/{IMEI}
    if (parts.length >= 4 && parts[0] === 'zhhl' && parts[2] === 'publish') {
      return parts[3]; // 返回IMEI
    }

    // 兼容旧格式
    const patterns = [
      /^device\/([^/]+)\//,  // device/{device_id}/...
      /^\/([^/]+)\//,       // /{device_id}/...
      /^([^/]+)\//          // {device_id}/...
    ];

    for (const pattern of patterns) {
      const match = topic.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 获取设备的心跳间隔
   * @param {string} deviceId - 设备ID
   * @returns {number} 心跳间隔（秒）
   */
  async getDeviceHeartbeatInterval(deviceId) {
    const config = await this.getDeviceConfig(deviceId);
    return config.heartbeat_interval || 60;
  }

  /**
   * 获取设备的离线超时时间
   * @param {string} deviceId - 设备ID
   * @returns {number} 离线超时时间（秒）
   */
  async getDeviceOfflineTimeout(deviceId) {
    const config = await this.getDeviceConfig(deviceId);
    return config.offline_timeout || 300;
  }

  /**
   * 检查设备是否启用MQTT
   * @param {string} deviceId - 设备ID
   * @returns {boolean} 是否启用
   */
  async isDeviceEnabled(deviceId) {
    const config = await this.getDeviceConfig(deviceId);
    return config.enabled !== false;
  }

  /**
   * 清除设备配置缓存
   * @param {string} deviceId - 设备ID
   */
  clearDeviceCache(deviceId) {
    this.deviceConfigs.delete(deviceId);
  }

  /**
   * 清除所有配置缓存
   */
  clearAllCache() {
    this.deviceConfigs.clear();
  }

  /**
   * 获取所有设备的MQTT配置
   * @param {string} tenantId - 租户ID（可选）
   * @returns {Array} 设备配置列表
   */
  async getAllDeviceConfigs(tenantId = null) {
    try {
      const whereClause = tenantId ? { tenant_id: tenantId } : {};

      const devices = await Device.findAll({
        where: whereClause,
        include: [{
          model: DeviceType,
          as: 'device_type'
        }]
      });

      const configs = [];
      for (const device of devices) {
        const config = this.buildDeviceConfig(device);
        configs.push(config);
      }

      return configs;
    } catch (error) {
      logger.error('获取所有设备MQTT配置失败:', error);
      throw error;
    }
  }
}

module.exports = new MqttConfigService();
