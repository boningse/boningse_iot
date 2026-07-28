const mqtt = require('mqtt');
const { Op } = require('sequelize');
const { Device, DeviceLog, DeviceType, Tenant, Manufacturer } = require('../models');
const websocketService = require('./websocketService');
const MessageProcessingService = require('./messageProcessingService');
const { mqttLogger: logger } = require('../utils/logger');
const { Pool } = require('pg');
const { getPoolConfig } = require('../config/database');
const { parseDa51kdUplink, parseDa51kdWriteAck } = require('../utils/da51kdProtocol');
const { parseZqcSwitchStatus } = require('../utils/zqcSwitchProtocol');
const telemetryStore = require('./telemetryStore');
const alarmService = require('./alarmService');
require('dotenv').config();

const persistVerboseDeviceLogs = process.env.PERSIST_VERBOSE_DEVICE_LOGS === 'true';
const persistDetailedMessageStats = process.env.MESSAGE_DETAIL_TRACKING_ENABLED === 'true';
const isInactiveControlModuleError = (error) => (
  error?.code === '23514' && /not active in control module/.test(error.message || '')
);
const persistDeviceLog = async (entry) => {
  const level = String(entry?.level || 'info').toLowerCase();
  if (!persistVerboseDeviceLogs && !['warning', 'warn', 'error'].includes(level)) return null;
  return DeviceLog.create(entry);
};

// PostgreSQL连接池
const pool = new Pool({
  ...getPoolConfig(),
  max: parseInt(process.env.MQTT_DB_POOL_MAX, 10) || Math.min(parseInt(process.env.DB_POOL_MAX, 10) || 30, 10),
  min: parseInt(process.env.MQTT_DB_POOL_MIN, 10) || 0
});

const SWITCH_ELECTRICAL_FIELDS = [
  'voltage', 'current', 'power', 'energy',
  'voltage_a', 'voltage_b', 'voltage_c',
  'current_a', 'current_b', 'current_c',
  'power_a', 'power_b', 'power_c',
  'power_factor', 'power_factor_a', 'power_factor_b', 'power_factor_c',
  'frequency', 'leakage_current', 'temperature',
  'temperature_a', 'temperature_b', 'temperature_c'
];

// 限制消息统计数据大小，防止内存泄漏
const MAX_MESSAGE_STATS_SIZE = 1000;
const MAX_DEVICE_CACHE_SIZE = 500;
class MqttService {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 50; // 增加最大重连次数
    this.reconnectInterval = 10000; // 增加重连间隔到10秒

    // MQTT配置
    this.config = {
      brokerUrl: process.env.MQTT_BROKER_URL,
      username: process.env.MQTT_USERNAME,
      password: process.env.MQTT_PASSWORD,
      clientId: (process.env.MQTT_CLIENT_ID || 'iot_backend_server') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + process.pid,
      keepAlive: parseInt(process.env.MQTT_KEEP_ALIVE) || 60,
      cleanSession: true  // 强制使用clean session避免客户端ID冲突
    };

    // 主题配置 - 支持动态厂商编号的两种格式
    this.topicPatterns = {
      // 第一种格式：zhhl/{厂商编号}/{IMEI}/publish
      deviceDataType1: 'zhhl/+/+/publish',
      // 第二种格式：zhhl/{厂商编号}/publish/{IMEI}
      deviceDataType2: 'zhhl/+/publish/+',
      // 多联机主题：multi-unit-ac/{厂商编号}/{IMEI}/status
      multiUnitAcStatus: 'multi-unit-ac/+/+/status',
      // 多联机控制响应：multi-unit-ac/{厂商编号}/{IMEI}/response
      multiUnitAcResponse: 'multi-unit-ac/+/+/response'
    };

    // 设备缓存 - 减少数据库查询
    this.deviceCache = new Map();
    this.cacheExpiry = 5 * 60 * 1000; // 5分钟缓存过期
    this.pendingCommands = new Map(); // 跟踪已发送的RTU命令
    this.manufacturerPublishTopics = new Set();

    // 设备离线检测
    this.offlineCheckInterval = 5 * 60 * 1000; // 5分钟检查一次
    this.offlineTimeout = 30 * 60 * 1000;     // 30分钟无通信视为离线
    this.offlineCheckTimer = null;

    // 多联机主机心跳超时检测
    this.multiUnitAcHeartbeatCheckInterval = 3 * 60 * 1000; // 3分钟检查一次
    this.multiUnitAcHeartbeatTimeout = 5 * 60 * 1000;      // 5分钟无心跳视为离线
    this.multiUnitAcHeartbeatCheckTimer = null;

    // 设备最后活跃时间记录
    this.deviceLastSeen = new Map();
    this.deviceLastSeenCleanupInterval = 5 * 60 * 1000;
    this.deviceLastSeenMaxAge = 60 * 60 * 1000;
    this.deviceLastSeenCleanupTimer = null;

    // 消息统计
    this.messageStats = {
      inbound: new Map(), // 按时间段统计接收消息
      outbound: new Map(), // 按时间段统计发送消息
      totalInbound: 0,
      totalOutbound: 0
    };

    // 清理统计数据的定时器
    this.statsCleanupInterval = 5 * 60 * 1000; // 已优化，原1小时 // 1小时清理一次
    this.statsCleanupTimer = null;

    // 消息处理服务将在连接时从全局实例获取
    this.messageProcessingService = null;
  }

  /**
   * 连接MQTT服务器
   */
  async connect() {
    try {
      logger.info('正在连接MQTT服务器...', { brokerUrl: this.config.brokerUrl });

      const options = {
        clientId: this.config.clientId,
        keepalive: this.config.keepAlive,
        clean: this.config.cleanSession,
        reconnectPeriod: this.reconnectInterval,
        connectTimeout: 60000, // 增加连接超时时间到60秒
        protocolVersion: 4,
        rejectUnauthorized: false, // 允许自签名证书
        will: {
          topic: 'system/status',
          payload: JSON.stringify({ clientId: this.config.clientId, status: 'offline', timestamp: Date.now() }),
          qos: 1,
          retain: false
        }
      };

      if (this.config.username) {
        options.username = this.config.username;
        options.password = this.config.password;
      }

      this.client = mqtt.connect(this.config.brokerUrl, options);

      // 连接成功事件
      this.client.on('connect', (connack) => {
        logger.info('MQTT连接成功', {
          clientId: this.config.clientId,
          sessionPresent: connack.sessionPresent,
          returnCode: connack.returnCode
        });
        this.isConnected = true;
        this.reconnectAttempts = 0;

        // 获取全局消息处理服务实例（延迟获取，因为可能还未初始化）
        this.messageProcessingService = global.messageProcessingServiceInstance || null;

        // 如果消息处理服务还未初始化，设置定时器等待
        if (!this.messageProcessingService) {
          logger.warn('消息处理服务尚未初始化，将在稍后重试获取');
          this.waitForMessageProcessingService();
        }

        this.subscribeToTopics();
        this.startOfflineCheck();
        this.startStatsCleanup();
        this.startCacheCleanup();
      });

      // 消息接收事件
      this.client.on('message', (topic, message) => {
        this.handleMessage(topic, message);
      });

      // 连接错误事件
      this.client.on('error', (error) => {
        logger.error('MQTT连接错误', {
          error: error.message,
          code: error.code,
          clientId: this.config.clientId,
          brokerUrl: this.config.brokerUrl,
          reconnectAttempts: this.reconnectAttempts
        });
        this.isConnected = false;
      });

      // 连接断开事件
      this.client.on('close', () => {
        logger.warn('MQTT连接已断开', {
          clientId: this.config.clientId,
          wasConnected: this.isConnected,
          reconnectAttempts: this.reconnectAttempts
        });
        this.isConnected = false;
        this.stopOfflineCheck();
        this.stopStatsCleanup();
        this.stopCacheCleanup();
        this.handleReconnect();
      });

      // 离线事件
      this.client.on('offline', () => {
        logger.warn('MQTT客户端离线');
        this.isConnected = false;
      });

    } catch (error) {
      logger.error('MQTT连接失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 等待消息处理服务初始化
   */
  waitForMessageProcessingService() {
    const checkInterval = setInterval(() => {
      if (global.messageProcessingServiceInstance) {
        this.messageProcessingService = global.messageProcessingServiceInstance;
        logger.info('消息处理服务实例获取成功');
        clearInterval(checkInterval);
      }
    }, 1000); // 每秒检查一次

    // 设置超时，避免无限等待
    setTimeout(() => {
      if (!this.messageProcessingService) {
        logger.error('等待消息处理服务初始化超时');
        clearInterval(checkInterval);
      }
    }, 30000); // 30秒超时
  }

  /**
   * 订阅主题
   */
  subscribeToTopics() {
    const topics = Object.values(this.topicPatterns);
    
    logger.info('开始订阅MQTT主题', { topicPatterns: this.topicPatterns, topics });

    topics.forEach(topic => {
      this.client.subscribe(topic, { qos: 1 }, (err) => {
        if (err) {
          logger.error('订阅主题失败', { topic, error: err.message });
        } else {
          logger.info('成功订阅主题', { topic });
        }
      });
    });

    // 注释掉设备命令主题订阅，设备与设备通信根据厂商管理中订阅方式进行
    // this.subscribeToAllDeviceCommandTopics();
    this.subscribeToConfiguredManufacturerPublishTopics(true);
  }

  async reloadManufacturerSubscriptions(force = false) {
    if (!this.client || !this.isConnected) {
      throw new Error('MQTT客户端尚未连接');
    }

    const manufacturers = await Manufacturer.findAll({
      where: { status: 'active' },
      attributes: ['code', 'mqtt_config']
    });
    const desiredTopics = new Set();

    const toBrokerSubscription = (topic, manufacturerCode) => String(topic || '')
      .replace(/\{manufacturerCode\}/gi, manufacturerCode)
      .replace(/\{manufacturer_code\}/gi, manufacturerCode)
      .replace(/\{imei\}|\{deveui\}|<deveui>|\{deviceId\}|\{device_id\}/gi, '+');

    manufacturers.forEach(manufacturer => {
      const config = manufacturer.mqtt_config || {};
      if (config.publishTopic) desiredTopics.add(toBrokerSubscription(config.publishTopic, manufacturer.code));
      if (Array.isArray(config.publishTopics)) {
        config.publishTopics
          .filter(item => item && item.enabled !== false && item.topic)
          .forEach(item => desiredTopics.add(toBrokerSubscription(item.topic, manufacturer.code)));
      }
    });

    const staticTopics = new Set(Object.values(this.topicPatterns));
    const removedTopics = [...this.manufacturerPublishTopics]
      .filter(topic => !desiredTopics.has(topic) && !staticTopics.has(topic));
    const addedTopics = force
      ? [...desiredTopics]
      : [...desiredTopics].filter(topic => !this.manufacturerPublishTopics.has(topic));

    await Promise.all(removedTopics.map(topic => new Promise((resolve, reject) => {
      this.client.unsubscribe(topic, err => err ? reject(err) : resolve());
    })));
    await Promise.all(addedTopics.map(topic => new Promise((resolve, reject) => {
      this.client.subscribe(topic, { qos: 1 }, err => err ? reject(err) : resolve());
    })));

    this.manufacturerPublishTopics = desiredTopics;
    logger.info('厂商MQTT订阅已热更新', {
      addedTopics,
      removedTopics,
      total: desiredTopics.size
    });
    return { addedTopics, removedTopics, total: desiredTopics.size };
  }

  async subscribeToConfiguredManufacturerPublishTopics(force = false) {
    try {
      return await this.reloadManufacturerSubscriptions(force);
    } catch (error) {
      logger.error('订阅厂商上行主题失败', { error: error.message });
      return null;
    }
  }

  /**
   * 订阅所有设备的命令主题
   */
  async subscribeToAllDeviceCommandTopics() {
    try {
      const { Device, Manufacturer } = require('../models');

      // 获取所有设备
      const devices = await Device.findAll({
        include: [{
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['code', 'subscription_type']
        }],
        where: {
          status: 'active' // 只订阅活跃设备
        }
      });

      for (const device of devices) {
        await this.subscribeToDeviceCommandTopics(device);
      }

      logger.info(`已为 ${devices.length} 个设备订阅命令主题`);
    } catch (error) {
      logger.error('订阅所有设备命令主题失败:', error);
    }
  }

  /**
   * 为单个设备订阅命令主题
   */
  async subscribeToDeviceCommandTopics(device) {
    try {
      if (!device.imei || !device.manufacturer?.code) {
        logger.warn('设备缺少IMEI或厂商信息，跳过订阅', {
          deviceId: device.device_id,
          imei: device.imei,
          manufacturerCode: device.manufacturer?.code
        });
        return;
      }

      const manufacturerCode = device.manufacturer.code;
      const subscriptionType = device.manufacturer.subscription_type || 'imei_middle';
      let commandTopic;

      if (subscriptionType === 'imei_middle') {
        // IMEI在中间：zhhl/{厂商编号}/{IMEI}/subscribe
        commandTopic = `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
      } else if (subscriptionType === "custom") {
        const mfgConfig = device.manufacturer?.mqtt_config || {};
        const subTopics = mfgConfig.subscribeTopics || mfgConfig.subscribe_topics || [];
        if (subTopics.length > 0) {
          for (const ti of subTopics) {
            if (ti.enabled !== false && ti.topic) {
              const topic = ti.topic.replace(/{imei}/g, device.imei);
              this.client.subscribe(topic, { qos: ti.qos || 1 }, (e) => {
                if (e) logger.error("Custom unsub fail", { deviceId: device.device_id, topic, error: e.message });
                else logger.info("Custom sub ok", { deviceId: device.device_id, topic });
              });
            }
          }
        } else {
          logger.warn("Custom no subscribe topics", { deviceId: device.device_id });
        }
        return;
      } else if (subscriptionType === 'imei_last') {
        // IMEI在最后：zhhl/{厂商编号}/subscribe/{IMEI}
        commandTopic = `zhhl/${manufacturerCode}/subscribe/${device.imei}`;
      } else {
        logger.warn('未知的订阅类型', {
          deviceId: device.device_id,
          subscriptionType
        });
        return;
      }

      // 订阅命令主题
      this.client.subscribe(commandTopic, { qos: 1 }, (err) => {
        if (err) {
          logger.error('订阅设备命令主题失败', {
            deviceId: device.device_id,
            topic: commandTopic,
            error: err.message
          });
        } else {
          logger.info('成功订阅设备命令主题', {
            deviceId: device.device_id,
            topic: commandTopic
          });
        }
      });

    } catch (error) {
      logger.error('为设备订阅命令主题失败:', {
        deviceId: device.device_id,
        error: error.message
      });
    }
  }

  /**
   * 为新设备订阅命令主题（供外部调用）
   */
  async subscribeNewDevice(device) {
    if (!this.isConnected) {
      logger.warn('MQTT未连接，无法订阅新设备', { deviceId: device.device_id });
      return;
    }

    await this.subscribeToDeviceCommandTopics(device);
  }

  /**
   * 取消设备订阅（设备删除时调用）
   */
  async unsubscribeDevice(device) {
    try {
      if (!this.isConnected || !device.imei || !device.manufacturer?.code) {
        return;
      }

      const manufacturerCode = device.manufacturer.code;
      const subscriptionType = device.manufacturer.subscription_type || 'imei_middle';
      let commandTopic;

      if (subscriptionType === 'imei_middle') {
        commandTopic = `zhhl/${manufacturerCode}/${device.imei}/subscribe`;
      } else if (subscriptionType === "custom") {
        const mfgConfig = device.manufacturer?.mqtt_config || {};
        const subTopics = mfgConfig.subscribeTopics || mfgConfig.subscribe_topics || [];
        if (subTopics.length > 0) {
          for (const ti of subTopics) {
            if (ti.enabled !== false && ti.topic) {
              const topic = ti.topic.replace(/{imei}/g, device.imei);
              this.client.unsubscribe(topic, { qos: ti.qos || 1 }, (e) => {
                if (e) logger.error("Custom unsub fail", { deviceId: device.device_id, topic, error: e.message });
                else logger.info("Custom unsub ok", { deviceId: device.device_id, topic });
              });
            }
          }
        } else {
        }
        return;
        return;
      } else if (subscriptionType === 'imei_last') {
        commandTopic = `zhhl/${manufacturerCode}/subscribe/${device.imei}`;
      }

      if (commandTopic) {
        this.client.unsubscribe(commandTopic, (err) => {
          if (err) {
            logger.error('取消订阅设备命令主题失败', {
              deviceId: device.device_id,
              topic: commandTopic,
              error: err.message
            });
          } else {
            logger.info('成功取消订阅设备命令主题', {
              deviceId: device.device_id,
              topic: commandTopic
            });
          }
        });
      }
    } catch (error) {
      logger.error('取消设备订阅失败:', {
        deviceId: device.device_id,
        error: error.message
      });
    }
  }

  /**
   * 处理重连
   */
  handleReconnect() {
    // 增加重连计数，但不限制最大重连次数
    this.reconnectAttempts++;

    // 如果超过最大重连次数，记录警告但仍然继续尝试
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('MQTT重连次数已达上限，但仍将继续尝试', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
      // 重置重连计数，避免日志过多
      this.reconnectAttempts = this.maxReconnectAttempts / 2;
    } else {
      logger.info('尝试重连MQTT', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts
      });
    }

    // 使用指数退避策略计算重连间隔，但设置上限
    const reconnectDelay = Math.min(
      this.reconnectInterval * Math.pow(1.5, Math.min(this.reconnectAttempts, 10) - 1),
      60000 // 最大重连间隔为60秒
    );

    setTimeout(() => {
      this.connect();
    }, reconnectDelay);
  }

  /**
   * 处理接收到的消息
   */
  async handleMessage(topic, message) {
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      // 检查消息是否为二进制RTU数据
      let messageStr;
      let isBinaryRtuData = false;
      
      // 先检查是否为二进制数据（RTU响应通常是二进制格式）
      if (Buffer.isBuffer(message)) {
        // 检查是否包含典型的Modbus RTU响应特征
        if (message.length >= 5 && 
            (message[1] === 0x03 || message[1] === 0x04 || message[1] === 0x06 || message[1] === 0x10)) {
          isBinaryRtuData = true;
          // 对于RTU数据，保持原始Buffer格式，不转换为字符串
          messageStr = message;
        } else {
          messageStr = message.toString();
        }
      } else {
        messageStr = message.toString();
        // 检查字符串是否包含RTU响应的特征（包含控制字符或Unicode转义序列）
        if (typeof messageStr === 'string' && 
            (messageStr.match(/[\x00-\x1F\x7F-\xFF]/) || 
             messageStr.includes('\u0001') || messageStr.includes('\u0003') || messageStr.includes('\u0004'))) {
          isBinaryRtuData = true;
        }
      }
      
      // 增强的MQTT消息接收日志
      logger.debug('收到MQTT消息', {
        消息ID: messageId,
        主题: topic,
        内容: isBinaryRtuData ? 
          (Buffer.isBuffer(messageStr) ? messageStr.toString('hex') : messageStr.substring(0, 50)) :
          (messageStr.length > 100 ? messageStr.substring(0, 100) + '...' : messageStr),
        内容长度: Buffer.isBuffer(messageStr) ? messageStr.length : messageStr.length,
        数据类型: isBinaryRtuData ? 'RTU二进制数据' : '文本数据',
        时间戳: new Date().toISOString()
      });
      
      // 保持原有的debug日志
      logger.debug('收到MQTT消息', { 
        topic, 
        message: isBinaryRtuData ? 
          (Buffer.isBuffer(messageStr) ? messageStr.toString('hex') : messageStr.substring(0, 50)) : messageStr, 
        messageId 
      });

      // 检查是否为DTU消息
      if (this.isDtuMessage(topic)) {
        // 转发给DTU网关服务处理
        if (this.messageProcessingService) {
          await this.messageProcessingService.processDtuMessage(topic, messageStr);
        }
        return;
      }

      // 从主题中提取设备ID
      const deviceId = this.extractDeviceIdFromTopic(topic);
      if (!deviceId) {
        logger.warn('无法从主题中提取设备ID', { topic, messageId });
        return;
      }

      // 处理消息数据：RTU二进制数据直接使用，其他数据尝试JSON解析
      let messageData;
      if (isBinaryRtuData) {
        // RTU数据直接使用，不进行JSON解析
        messageData = messageStr;
      } else {
        // 非RTU数据尝试JSON解析
        try {
          messageData = JSON.parse(messageStr);
        } catch (parseError) {
          // 如果不是JSON格式，直接使用原始字符串
          messageData = messageStr;
        }
      }

      // 更新设备最后活跃时间
      this.deviceLastSeen.set(deviceId, Date.now());

      // 统计接收到的消息（inbound）
      this.recordInboundMessage();

      // 获取设备信息以获取tenant_id
      const device = await this.getDeviceWithCache(deviceId, true);
      const tenantId = device ? device.tenant_id : null;

      // 根据主题和消息内容判断消息类型
      let messageType;
      if (topic.includes('/publish') || this.isZqcV200SwitchTopic(topic)) {
        // 新格式：根据消息内容判断类型
        messageType = this.determineMessageType(messageData, topic);
      } else {
        // 兼容旧格式：根据主题判断类型
        if (topic.includes('/data')) {
          messageType = 'data';
        } else if (topic.includes('/status')) {
          messageType = 'status';
        } else if (topic.includes('/heartbeat')) {
          messageType = 'heartbeat';
        } else if (topic.includes('/response')) {
          messageType = 'response';
        } else {
          messageType = 'data';
        }
      }

      // 记录消息接收状态
      if (this.messageProcessingService) {
        await this.messageProcessingService.recordMessageReceived(
          device ? device.id : null,
          topic,
          messageType,
          messageData,
          'inbound',
          messageId
        );
      }

      // 记录处理开始状态
      if (this.messageProcessingService) {
        await this.messageProcessingService.recordProcessingStarted(messageId);
      }

      // 根据主题和消息内容判断消息类型
      if (topic.includes('/publish') || this.isZqcV200SwitchTopic(topic)) {
        // 新格式：根据消息内容判断类型
        await this.handleMessageByType(deviceId, messageData, topic, messageType, messageId);
      } else {
        // 兼容旧格式：根据主题判断类型
        if (topic.includes('/data')) {
          await this.handleDeviceData(deviceId, messageData, topic, messageId);
        } else if (topic.includes('/status')) {
          await this.handleDeviceStatus(deviceId, messageData, topic, messageId);
        } else if (topic.includes('/heartbeat')) {
          await this.handleDeviceHeartbeat(deviceId, messageData, topic, messageId);
        } else if (topic.includes('/response')) {
          await this.handleDeviceResponse(deviceId, messageData, topic, messageId);
        } else {
          // 已识别设备的自定义厂商主题默认作为设备数据处理。
          await this.handleDeviceData(deviceId, messageData, topic, messageId);
        }
      }

      // 记录处理完成状态
      const processingTime = Date.now() - startTime;
      if (this.messageProcessingService) {
        await this.messageProcessingService.recordProcessingCompleted(messageId, true);
      }

    } catch (error) {
      logger.error('处理MQTT消息失败', {
        topic,
        error: error.message,
        stack: error.stack,
        messageId
      });

      // 记录处理失败状态
      const processingTime = Date.now() - startTime;
      if (this.messageProcessingService) {
        await this.messageProcessingService.recordProcessingFailed(messageId, error.message, processingTime);
      } else {
        logger.warn('消息处理服务未初始化，无法记录处理失败状态', { messageId });
      }
    }
  }

  /**
   * 从主题中提取设备ID
   */
  extractDeviceIdFromTopic(topic) {
    // 支持动态厂商编号的两种格式和兼容旧格式
    const parts = topic.split('/');

    // 自定义产品主题: product/{product}/device/{IMEI}/json/dat/up
    if (parts.length >= 7 && parts[0] === 'product' && parts[2] === 'device' && parts[6] === 'up') {
      return parts[3];
    }

    // 第一种格式: zhhl/{厂商编号}/{IMEI}/publish
    if (parts.length >= 4 && parts[0] === 'zhhl' && parts[3] === 'publish') {
      return parts[2]; // 返回IMEI
    }

    // 第二种格式: zhhl/{厂商编号}/publish/{IMEI}
    if (parts.length >= 4 && parts[0] === 'zhhl' && parts[2] === 'publish') {
      return parts[3]; // 返回IMEI
    }

    // 多联机格式: multi-unit-ac/{厂商编号}/{IMEI}/status 或 multi-unit-ac/{厂商编号}/{IMEI}/response
    if (parts.length >= 4 && parts[0] === 'multi-unit-ac' && (parts[3] === 'status' || parts[3] === 'response')) {
      return parts[2]; // 返回IMEI
    }

    // ZQC V200格式: ZQC/json/IoT/GW/V200/{IMEI}/up/json/CB/Data
    if (parts.length >= 10 && parts[0] === 'ZQC' && parts[4] === 'V200' && parts[6] === 'up') {
      return parts[5];
    }

    // 兼容旧格式: device/{deviceId}/...
    if (parts.length >= 3 && parts[0] === 'device') {
      return parts[1];
    }

    return null;
  }

  /**
   * 从主题中提取厂商编号
   */
  extractManufacturerFromTopic(topic) {
    const parts = topic.split('/');

    // 第一种格式: zhhl/{厂商编号}/{IMEI}/publish
    // 第二种格式: zhhl/{厂商编号}/publish/{IMEI}
    if (parts.length >= 3 && parts[0] === 'zhhl') {
      return parts[1]; // 返回厂商编号
    }

    if (parts.length >= 1 && parts[0] === 'ZQC') {
      return parts[0];
    }

    return null;
  }

  isZqcV200SwitchTopic(topic) {
    const parts = topic.split('/');
    return parts.length >= 10 &&
      parts[0] === 'ZQC' &&
      parts[1] === 'json' &&
      parts[4] === 'V200' &&
      parts[6] === 'up' &&
      parts[8] === 'CB' &&
      parts[9] === 'Data';
  }

  /**
   * 判断是否为DTU消息
   */
  isDtuMessage(topic) {
    // DTU消息主题格式: zhhl/{厂商编号}/{DTU_ID}/heartbeat 或 zhhl/{厂商编号}/{DTU_ID}/status
    // 或者包含 /data、/command_response 等DTU相关主题
    const parts = topic.split('/');
    
    if (parts.length >= 4 && parts[0] === 'zhhl') {
      const messageType = parts[3];
      // 检查是否为DTU相关的消息类型
      return messageType === 'heartbeat' || 
             messageType === 'status' || 
             messageType === 'data' || 
             messageType === 'command_response';
    }
    
    return false;
  }

  /**
   * 记录已发送的RTU命令（支持批量查询）
   * @param {string} deviceId - 设备ID
   * @param {number} slaveAddress - 从站地址
   * @param {number} functionCode - 功能码
   * @param {number} startAddress - 起始地址
   * @param {number} count - 寄存器数量
   * @param {Object} protocolConfig - 协议配置（可选）
   * @param {Object} registerConfig - 寄存器配置（可选）
   */
  recordSentCommand(deviceId, slaveAddress, functionCode, startAddress, count, protocolConfig = null, registerConfig = null, batchOptions = null) {
    const key = `${deviceId}_${slaveAddress}_${functionCode}`;
    
    // 支持批量查询的命令记录
    const commandRecord = {
      startAddress,
      count,
      protocolConfig,
      registerConfig,
      timestamp: Date.now(),
      isBatchQuery: false,
      registerMapping: null,
      registerNames: null
    };

    // 检查是否为批量查询命令（优先使用batchOptions）
    if (batchOptions && batchOptions.isBatchQuery) {
      commandRecord.isBatchQuery = true;
      commandRecord.registerMapping = batchOptions.registerMapping || [];
      commandRecord.registerNames = batchOptions.registerNames || [];
      
      logger.debug('记录批量查询命令（通过batchOptions）', {
        deviceId,
        slaveAddress,
        functionCode,
        startAddress,
        count,
        registerCount: commandRecord.registerMapping.length,
        registers: commandRecord.registerNames
      });
    } else if (registerConfig && registerConfig.register_mapping && Array.isArray(registerConfig.register_mapping)) {
      // 向后兼容：通过registerConfig检查批量查询
      commandRecord.isBatchQuery = true;
      commandRecord.registerMapping = registerConfig.register_mapping;
      commandRecord.registerNames = registerConfig.register_names || [];
      
      logger.debug('记录批量查询命令（通过registerConfig）', {
        deviceId,
        slaveAddress,
        functionCode,
        startAddress,
        count,
        registerCount: registerConfig.register_mapping.length,
        registers: registerConfig.register_names
      });
    }
    
    this.pendingCommands.set(key, commandRecord);
    
    // 清理超时的命令记录（超过30秒）
    setTimeout(() => {
      this.pendingCommands.delete(key);
    }, 30000);
  }

  /**
   * 获取已发送命令的信息
   * @param {string} deviceId - 设备ID
   * @param {number} slaveAddress - 从站地址
   * @param {number} functionCode - 功能码
   * @returns {Object|null} 命令信息
   */
  getSentCommandInfo(deviceId, slaveAddress, functionCode) {
    const key = `${deviceId}_${slaveAddress}_${functionCode}`;
    return this.pendingCommands.get(key) || null;
  }

  /**
   * 解析原始RTU响应数据
   * @param {Object} device - 设备对象
   * @param {string|Buffer} rawData - 原始RTU响应数据
   * @param {string} topic - MQTT主题
   * @returns {Object|null} 解析后的电表数据格式
   */
  async parseRawRTUResponse(device, rawData, topic) {
    try {
      const ModbusRtuUtils = require('../utils/modbusRtuUtils');
      const { ElectricMeter } = require('../models');
      
      // 处理原始数据转换为Buffer
      let buffer;
      try {
        if (Buffer.isBuffer(rawData)) {
          // 如果已经是Buffer，直接使用
          buffer = rawData;
          logger.debug('RTU响应数据已为Buffer格式', {
            bufferLength: buffer.length,
            hexString: ModbusRtuUtils.bufferToHexString(buffer)
          });
        } else {
          // 如果是字符串，转换为Buffer
          // 直接从字符串的字符码创建Buffer，保持原始字节值
          const bytes = [];
          for (let i = 0; i < rawData.length; i++) {
            bytes.push(rawData.charCodeAt(i) & 0xFF);
          }
          buffer = Buffer.from(bytes);
          
          logger.debug('RTU响应数据从字符串转换为Buffer', {
            originalLength: rawData.length,
            bufferLength: buffer.length,
            hexString: ModbusRtuUtils.bufferToHexString(buffer)
          });
        }
      } catch (conversionError) {
        logger.error('RTU数据转换失败', { 
          error: conversionError.message, 
          rawDataType: Buffer.isBuffer(rawData) ? 'Buffer' : typeof rawData,
          rawDataLength: Buffer.isBuffer(rawData) ? rawData.length : rawData.length
        });
        return null;
      }
      
      // 解析RTU响应
      let parsedResponse;
      try {
        parsedResponse = ModbusRtuUtils.parseRTUResponse(buffer);
        logger.debug('RTU响应解析成功', { parsedResponse });
      } catch (parseError) {
        const errorDetails = {
          error: parseError.message,
          buffer: buffer.toString('hex'),
          bufferLength: buffer.length
        };
        
        // 如果有详细的CRC错误信息，添加到日志中
        if (parseError.details) {
          errorDetails.crcDetails = parseError.details;
        }
        
        logger.error('RTU响应解析失败', errorDetails);
        
        // 使用RTU诊断工具进行详细分析
        const RtuDiagnostics = require('../utils/rtuDiagnostics');
        const diagnosis = RtuDiagnostics.diagnoseRtuResponse(buffer);
        
        // 记录诊断信息
        logger.debug('RTU响应诊断结果', {
          confidence: diagnosis.confidence,
          issues: diagnosis.issues,
          suggestions: diagnosis.suggestions.slice(0, 3), // 只记录前3个建议
          crcCheck: diagnosis.crcCheck
        });
        
        // 如果诊断置信度足够高，使用诊断结果
        if (diagnosis.confidence >= 0.7 && diagnosis.parsedData) {
          parsedResponse = {
            success: true,
            slaveAddress: diagnosis.parsedData.slaveAddress,
            functionCode: diagnosis.parsedData.functionCode,
            data: {
              byteCount: diagnosis.parsedData.byteCount,
              registerCount: diagnosis.parsedData.registerCount,
              registers: diagnosis.parsedData.registers
            },
            crcWarning: 'CRC校验失败，但通过诊断工具恢复数据',
            diagnostics: {
              confidence: diagnosis.confidence,
              issues: diagnosis.issues,
              processedBuffer: diagnosis.processedBuffer
            }
          };
          
          logger.debug('通过RTU诊断工具成功恢复数据', {
            confidence: diagnosis.confidence,
            registers: diagnosis.parsedData.registers
          });
        }
        // 如果是CRC校验失败且诊断置信度不够，尝试传统的手动解析
        else if (parseError.message === 'CRC校验失败') {
          logger.warn('CRC校验失败，尝试传统手动解析', {
            crcDetails: parseError.details || 'No details available',
            diagnosticConfidence: diagnosis.confidence
          });
          
          try {
            // 手动解析数据，忽略CRC校验
            const slaveAddress = buffer.readUInt8(0);
            const functionCode = buffer.readUInt8(1);
            
            if (functionCode === 0x03 || functionCode === 0x04) {
              const byteCount = buffer.readUInt8(2);
              
              // 计算预期长度并处理额外字节
              const expectedLength = 3 + byteCount + 2;
              let processedBuffer = buffer;
              let extraBytesInfo = null;
              
              if (buffer.length > expectedLength) {
                const extraBytes = buffer.slice(expectedLength);
                extraBytesInfo = {
                  count: extraBytes.length,
                  data: ModbusRtuUtils.bufferToHexString(extraBytes)
                };
                processedBuffer = buffer.slice(0, expectedLength);
                logger.warn('检测到额外字节，已截断处理', extraBytesInfo);
              }
              
              const registerCount = byteCount / 2;
              const registers = [];
              
              for (let i = 0; i < registerCount; i++) {
                registers.push(processedBuffer.readUInt16BE(3 + i * 2));
              }
              
              parsedResponse = {
                success: true,
                slaveAddress,
                functionCode,
                data: {
                  byteCount,
                  registerCount,
                  registers
                },
                crcWarning: 'CRC校验失败，通过传统方法解析数据',
                extraBytes: extraBytesInfo,
                diagnostics: {
                  confidence: Math.max(0.5, diagnosis.confidence), // 至少0.5的置信度
                  method: 'manual_fallback'
                }
              };
              
              logger.debug('传统手动解析RTU响应成功', {
                parsedResponse,
                originalBufferLength: buffer.length,
                processedBufferLength: processedBuffer.length
              });
            } else {
              logger.error('不支持的功能码，无法忽略CRC解析', { functionCode });
              return null;
            }
          } catch (manualParseError) {
            logger.error('传统手动解析RTU响应失败', { error: manualParseError.message });
            return null;
          }
        } else {
          logger.error('RTU响应解析完全失败，无法恢复数据', {
            diagnosticConfidence: diagnosis.confidence,
            issues: diagnosis.issues
          });
          return null;
        }
      }
      
      if (!parsedResponse.success) {
        logger.warn('RTU响应包含错误', { error: parsedResponse.error, exceptionCode: parsedResponse.exceptionCode });
        return null;
      }
      
      // 查找对应的电表（根据从站地址匹配）
      // 尝试多种格式匹配从站地址
      const slaveAddressStr = parsedResponse.slaveAddress.toString();
      const slaveAddressPadded = slaveAddressStr.padStart(3, '0'); // 补零到3位
      
      const electricMeter = await ElectricMeter.findOne({
        where: {
          device_id: device.id,
          meter_address: {
            [require('sequelize').Op.in]: [slaveAddressStr, slaveAddressPadded]
          },
          status: 'active'
        }
      });
      
      if (!electricMeter) {
        logger.warn('未找到匹配的电表', { 
          deviceId: device.id, 
          slaveAddress: parsedResponse.slaveAddress 
        });
        return null;
      }
      
      // 构造电表数据格式
      const electricMeterData = {
        meter_id: electricMeter.id,
        meter_address: parsedResponse.slaveAddress,
        meter_number: electricMeter.meter_number,
        function_code: parsedResponse.functionCode,
        register_data: {},
        raw_response: rawData,
        parsed_response: parsedResponse
      };
      
      // 尝试从已发送的命令记录中获取正确的起始地址和协议配置
      const commandInfo = this.getSentCommandInfo(device.id, parsedResponse.slaveAddress, parsedResponse.functionCode);
      let startAddress = null; // 不使用默认地址，必须从协议配置中获取
      let protocolConfig = null;
      let registerConfig = null;
      
      // 如果是读取寄存器的响应，解析寄存器数据
      if (parsedResponse.functionCode === 0x03 || parsedResponse.functionCode === 0x04) {
        const registers = parsedResponse.data.registers;
        
        if (commandInfo) {
          startAddress = commandInfo.startAddress;
          protocolConfig = commandInfo.protocolConfig;
          registerConfig = commandInfo.registerConfig;
          
          logger.debug('使用已记录的命令信息解析RTU响应', {
            deviceId: device.id,
            slaveAddress: parsedResponse.slaveAddress,
            functionCode: parsedResponse.functionCode,
            startAddress: startAddress,
            expectedCount: commandInfo.count,
            actualCount: registers.length,
            hasProtocolConfig: !!protocolConfig,
            hasRegisterConfig: !!registerConfig
          });
        } else {
          // 尝试从设备的协议配置中获取起始地址
          if (electricMeter.protocol_config && electricMeter.protocol_config.modbus_registers) {
            const matchingRegister = electricMeter.protocol_config.modbus_registers.find(reg => 
              reg.function_code === parsedResponse.functionCode
            );
            if (matchingRegister) {
              startAddress = matchingRegister.address;
              protocolConfig = electricMeter.protocol_config;
              logger.debug('从电表协议配置中获取起始地址', {
                deviceId: device.id,
                slaveAddress: parsedResponse.slaveAddress,
                functionCode: parsedResponse.functionCode,
                startAddress: startAddress
              });
            }
          }
          
          if (!startAddress) {
            logger.error('无法确定起始地址，跳过RTU响应解析', {
              deviceId: device.id,
              slaveAddress: parsedResponse.slaveAddress,
              functionCode: parsedResponse.functionCode,
              reason: '未找到命令记录且协议配置中无匹配寄存器'
            });
            return;
          }
        }
        
        // 检查查询模式并相应解析
        if (commandInfo && commandInfo.queryMode === 'individual' && commandInfo.registerMapping && commandInfo.registerMapping.length === 1) {
          // 逐条查询响应解析
          const mapping = commandInfo.registerMapping[0];
          
          logger.debug('开始解析逐条查询响应', {
            meterId: electricMeter.id,
            meterAddress: parsedResponse.slaveAddress,
            functionCode: parsedResponse.functionCode,
            startAddress: startAddress,
            registerName: mapping.name,
            registerAddress: mapping.address,
            dataType: mapping.data_type,
            actualRegisters: registers.length
          });
          
          // 解析单个寄存器值
          let value = this.parseRegisterValue(registers, mapping.data_type);
          
          // 应用协议配置中的缩放和偏移
          if (protocolConfig && protocolConfig.modbus_registers) {
            const protocolRegister = protocolConfig.modbus_registers.find(
              reg => reg.address === mapping.address
            );
            
            if (protocolRegister) {
              if (protocolRegister.scale && protocolRegister.scale !== 1) {
                value = value * protocolRegister.scale;
              }
              if (protocolRegister.offset && protocolRegister.offset !== 0) {
                value = value + protocolRegister.offset;
              }
              
              logger.debug('应用协议配置缩放和偏移', {
                registerName: mapping.name,
                originalValue: this.parseRegisterValue(registers, mapping.data_type),
                scale: protocolRegister.scale,
                offset: protocolRegister.offset,
                finalValue: value
              });
            }
          }
          
          // 存储解析后的值
          electricMeterData.register_data[mapping.address] = value;
          
          logger.debug('逐条查询响应解析完成', {
            meterId: electricMeter.id,
            meterAddress: parsedResponse.slaveAddress,
            registerName: mapping.name,
            registerAddress: mapping.address,
            value: value,
            dataType: mapping.data_type
          });
          
        } else if (commandInfo && commandInfo.isBatchQuery && commandInfo.registerMapping) {
          // 批量查询响应解析
          logger.debug('解析批量查询响应', {
            deviceId: device.id,
            slaveAddress: parsedResponse.slaveAddress,
            functionCode: parsedResponse.functionCode,
            startAddress: startAddress,
            batchSize: commandInfo.count,
            actualRegisters: registers.length,
            mappingCount: commandInfo.registerMapping.length
          });
          
          // 根据寄存器映射分解批量响应数据
          for (const mapping of commandInfo.registerMapping) {
            const offset = mapping.offset || 0;
            
            // 根据数据类型确定寄存器占用的字数
            const registerWords = (mapping.data_type === 'uint32' || mapping.data_type === 'int32' || mapping.data_type === 'float32') ? 2 : 1;
            
            if (offset + registerWords - 1 < registers.length) {
              // 根据数据类型处理寄存器值
              let value = registers[offset];
              
              // 处理多字寄存器数据类型
              if ((mapping.data_type === 'uint32' || mapping.data_type === 'int32') && offset + 1 < registers.length) {
                // 32位整数：高位在前，低位在后
                const highWord = registers[offset];
                const lowWord = registers[offset + 1];
                let combinedValue = (highWord << 16) | lowWord;
                
                // 如果是有符号32位整数，需要处理符号位
                if (mapping.data_type === 'int32' && combinedValue > 0x7FFFFFFF) {
                  combinedValue = combinedValue - 0x100000000;
                }
                
                value = combinedValue;
                
                logger.debug(`解析${mapping.data_type}值`, {
                  registerName: mapping.name,
                  offset: offset,
                  registerWords: registerWords,
                  highWord: highWord,
                  lowWord: lowWord,
                  combinedValue: value,
                  hexValue: '0x' + (combinedValue >>> 0).toString(16).toUpperCase()
                });
              } else if (mapping.data_type === 'float32' && offset + 1 < registers.length) {
                // 32位浮点数
                const buffer = Buffer.alloc(4);
                buffer.writeUInt16BE(registers[offset], 0);
                buffer.writeUInt16BE(registers[offset + 1], 2);
                value = buffer.readFloatBE(0);
                
                logger.debug('解析float32值', {
                  registerName: mapping.name,
                  offset: offset,
                  registerWords: registerWords,
                  highWord: registers[offset],
                  lowWord: registers[offset + 1],
                  floatValue: value
                });
              }
              
              // 对于批量查询，实际地址应该是配置的寄存器地址
              // 因为offset已经在mergeConsecutiveRegisters中根据协议配置正确计算了
              const actualAddress = mapping.address;
              electricMeterData.register_data[actualAddress] = value;
              
              logger.debug('批量查询寄存器映射', {
                registerName: mapping.name,
                configuredAddress: mapping.address,
                actualAddress: actualAddress,
                startAddress: startAddress,
                offset: offset,
                rawValue: registers[offset],
                processedValue: value,
                dataType: mapping.data_type
              });
            } else {
              logger.warn('批量查询响应数据不足', {
                registerName: mapping.name,
                expectedOffset: offset,
                actualLength: registers.length
              });
            }
          }
          
          logger.debug('批量查询响应解析完成', {
            meterId: electricMeter.id,
            meterAddress: parsedResponse.slaveAddress,
            mappedRegisters: Object.keys(electricMeterData.register_data).length,
            registerData: electricMeterData.register_data
          });
          
        } else if (protocolConfig && protocolConfig.modbus_registers && Array.isArray(protocolConfig.modbus_registers)) {
          // 单个寄存器查询响应解析（原有逻辑）
          const matchingRegister = protocolConfig.modbus_registers.find(reg => 
            reg.function_code === parsedResponse.functionCode && 
            reg.address === startAddress
          );
          
          if (matchingRegister) {
            // 使用协议配置中定义的地址
            for (let i = 0; i < registers.length && i < (matchingRegister.count || 1); i++) {
              electricMeterData.register_data[matchingRegister.address + i] = registers[i];
            }
            
            logger.debug('使用协议配置解析寄存器数据', {
              registerName: matchingRegister.name || matchingRegister.description,
              configuredAddress: matchingRegister.address,
              configuredCount: matchingRegister.count || 1,
              actualRegisters: registers.length
            });
          } else {
            // 协议配置中没有找到匹配的寄存器，使用记录的起始地址
            for (let i = 0; i < registers.length; i++) {
              electricMeterData.register_data[startAddress + i] = registers[i];
            }
            
            logger.warn('协议配置中未找到匹配的寄存器配置，使用记录的起始地址', {
              startAddress,
              functionCode: parsedResponse.functionCode
            });
          }
        } else {
          // 没有协议配置，必须有记录的起始地址才能解析
          if (startAddress !== null) {
            for (let i = 0; i < registers.length; i++) {
              electricMeterData.register_data[startAddress + i] = registers[i];
            }
          } else {
            logger.error('无协议配置且无起始地址，无法解析寄存器数据', {
              deviceId: device.id,
              slaveAddress: parsedResponse.slaveAddress,
              functionCode: parsedResponse.functionCode
            });
            return;
          }
        }
        
        logger.debug('电表寄存器数据解析完成', {
          meterId: electricMeter.id,
          meterAddress: parsedResponse.slaveAddress,
          startAddress: startAddress,
          registerCount: registers.length,
          registerData: electricMeterData.register_data
        });
      }
      
      // 添加command_info字段，用于数据聚合器匹配预期命令
      if (commandInfo && (parsedResponse.functionCode === 0x03 || parsedResponse.functionCode === 0x04)) {
        const registers = parsedResponse.data.registers;
        electricMeterData.command_info = {
          functionCode: parsedResponse.functionCode,
          startAddress: startAddress,
          quantity: registers ? registers.length : 0,
          isBatchQuery: commandInfo.isBatchQuery || false,
          queryMode: commandInfo.queryMode || 'batch',
          registerMapping: commandInfo.registerMapping || [],
          registerNames: commandInfo.registerNames || []
        };
        
        logger.debug('添加命令信息到电表数据', {
          meterId: electricMeter.id,
          commandInfo: electricMeterData.command_info
        });
      } else {
        logger.warn('未找到命令信息或不支持的功能码，数据聚合器可能无法正确匹配', {
          meterId: electricMeter.id,
          functionCode: parsedResponse.functionCode,
          startAddress: startAddress,
          hasCommandInfo: !!commandInfo
        });
      }
      
      return electricMeterData;
      
    } catch (error) {
      logger.error('解析原始RTU响应数据失败', { 
        deviceId: device.id, 
        error: error.message, 
        rawData: rawData.substring(0, 100) 
      });
      return null;
    }
  }

  /**
   * 解析寄存器值
   * @param {Array} registers - 寄存器数组
   * @param {string} dataType - 数据类型
   * @returns {number} 解析后的值
   */
  parseRegisterValue(registers, dataType) {
    if (!registers || registers.length === 0) {
      return 0;
    }
    
    switch (dataType) {
      case 'uint16':
        return registers[0];
        
      case 'int16':
        // 16位有符号整数
        const value16 = registers[0];
        return value16 > 32767 ? value16 - 65536 : value16;
        
      case 'uint32':
        if (registers.length < 2) return registers[0];
        // 32位无符号整数：高位在前，低位在后
        return (registers[0] << 16) | registers[1];
        
      case 'int32':
        if (registers.length < 2) return registers[0];
        // 32位有符号整数
        const value32 = (registers[0] << 16) | registers[1];
        return value32 > 0x7FFFFFFF ? value32 - 0x100000000 : value32;
        
      case 'float32':
        if (registers.length < 2) return registers[0];
        // 32位浮点数
        const buffer = Buffer.alloc(4);
        buffer.writeUInt16BE(registers[0], 0);
        buffer.writeUInt16BE(registers[1], 2);
        return buffer.readFloatBE(0);
        
      default:
        // 默认返回第一个寄存器的值
        return registers[0];
    }
  }

  /**
   * 根据消息内容判断消息类型
   */
  determineMessageType(messageData, topic) {
    // 添加调试日志
    logger.debug('消息类型判断', {
      messageData: Buffer.isBuffer(messageData) ? messageData.toString('hex') : 
                   (typeof messageData === 'string' ? messageData.substring(0, 100) : messageData), 
      messageType: Buffer.isBuffer(messageData) ? 'Buffer' : typeof messageData,
      topic 
    });
    
    // 如果是Buffer类型，直接识别为RTU响应数据
    if (Buffer.isBuffer(messageData)) {
      logger.debug('识别为RTU响应数据(Buffer格式)', {
        hexData: messageData.toString('hex'),
        length: messageData.length 
      });
      return 'modbus_response';
    }
    
    // 如果是字符串类型，检查是否为DTU心跳包或RTU响应
    if (typeof messageData === 'string') {
      const trimmedData = messageData.trim();
      
      // 检查是否为RTU响应数据（优先检查）
      // RTU响应可能是十六进制字符串或包含Unicode转义序列的字符串
      if (/^[0-9A-Fa-f\s]+$/.test(trimmedData) || 
          /\\u[0-9A-Fa-f]{4}/.test(trimmedData) || 
          trimmedData.match(/[\x00-\x1F\x7F-\xFF]/) ||
          (trimmedData.includes('\u0001') || trimmedData.includes('\u0003') || trimmedData.includes('\u0004'))) {
        logger.debug('识别为RTU响应数据(字符串格式)', { messageData: trimmedData.substring(0, 50) });
        return 'modbus_response';
      }
      
      // DTU心跳包通常是简单的字符串，如"www.usr.cn"
      if (messageData === 'www.usr.cn' || messageData.includes('usr.cn')) {
        logger.debug('识别为DTU心跳包', { messageData });
        return 'heartbeat';
      }
      
      logger.debug('识别为普通数据', { messageData: messageData.substring(0, 50) });
      return 'data';
    }

    // 检查消息中是否有明确的类型字段
    if (messageData.type) {
      return messageData.type;
    }

    if (this.isZqcV200SwitchData(messageData, topic)) {
      return 'zqc_switch_data';
    }

    // 检查是否为电表数据响应
    if (messageData.meter_id || messageData.meter_address || messageData.meter_number) {
      return 'electric_meter_data';
    }

    // 检查是否为Modbus响应
    if (messageData.modbus_response || (messageData.register_data || messageData.coil_data)) {
      return 'modbus_response';
    }

    // 根据消息内容特征判断类型
    if (messageData.command || messageData.commandId) {
      return 'response';
    }

    if (messageData.status !== undefined) {
      return 'status';
    }

    if (messageData.heartbeat || messageData.ping) {
      return 'heartbeat';
    }

    // 检查是否为多联机心跳包
    if (topic.includes('multi-unit-ac') && (messageData.heartbeat || messageData.ping || 
        (typeof messageData === 'string' && messageData.includes('heartbeat')))) {
      return 'multi_unit_ac_heartbeat';
    }

    // 检查是否为纯开关状态消息（只包含key1、key2、key3等开关字段，不包含电气数据）
    if ((messageData.key1 !== undefined || messageData.key2 !== undefined || messageData.key3 !== undefined) &&
      messageData.voltage === undefined && messageData.current === undefined && messageData.power === undefined) {
      return 'switch_status'; // 纯开关状态消息
    }

    // 检查是否为纯电气数据消息（只包含电压、电流、功率等，不包含开关状态）
    if ((messageData.voltage !== undefined || messageData.current !== undefined || messageData.power !== undefined) &&
      messageData.key1 === undefined && messageData.key2 === undefined && messageData.key3 === undefined) {
      return 'electrical_data'; // 纯电气数据消息
    }

    // 检查是否为复合消息（同时包含开关状态和电气数据）
    if ((messageData.key1 !== undefined || messageData.key2 !== undefined || messageData.key3 !== undefined) &&
      (messageData.voltage !== undefined || messageData.current !== undefined || messageData.power !== undefined)) {
      return 'lighting_combined'; // 复合照明数据消息
    }

    // 默认为数据类型
    return 'data';
  }

  /**
   * 根据消息类型分发处理
   */
  async handleMessageByType(deviceId, messageData, topic, messageType, messageId) {
    switch (messageType) {
      case 'data':
        await this.handleDeviceData(deviceId, messageData, topic, messageId);
        break;
      case 'status':
        // 检查是否为多联机状态消息
        if (topic.includes('multi-unit-ac')) {
          await this.handleMultiUnitAcStatus(deviceId, messageData, topic, messageId);
        } else {
          await this.handleDeviceStatus(deviceId, messageData, topic, messageId);
        }
        break;
      case 'heartbeat':
        await this.handleDeviceHeartbeat(deviceId, messageData, topic, messageId);
        break;
      case 'multi_unit_ac_heartbeat':
        await this.handleMultiUnitAcHeartbeat(deviceId, messageData, topic, messageId);
        break;
      case 'response':
        // 检查是否为多联机控制响应
        if (topic.includes('multi-unit-ac')) {
          await this.handleMultiUnitAcResponse(deviceId, messageData, topic, messageId);
        } else {
          await this.handleDeviceResponse(deviceId, messageData, topic, messageId);
        }
        break;
      case 'event':
        await this.handleDeviceEvent(deviceId, messageData, topic, messageId);
        break;
      case 'switch_status':
        // 纯开关状态消息，专门处理照明开关状态
        await this.handleLightingSwitchStatus(deviceId, messageData, topic, messageId);
        break;
      case 'electrical_data':
      case 'statistic':
        // 纯电气数据消息，专门处理照明电气数据
        // statistic类型的消息通常包含电气统计数据
        await this.handleLightingElectricalData(deviceId, messageData, topic, messageId);
        break;
      case 'lighting_combined':
        // 复合照明数据消息，包含开关状态和电气参数
        await this.handleDeviceData(deviceId, messageData, topic, messageId);
        break;
      case 'zqc_switch_data':
        await this.handleZqcSwitchElectricalData(deviceId, messageData, topic, messageId);
        break;
      case 'modbus_response':
      case 'electric_meter_data':
        // 电表模块已下线，不再解析、存储或广播旧电表数据。
        logger.debug('已忽略停用的电表数据', { deviceId, messageType, topic });
        break;
      case 'time':
        // 温控器运行时间统计数据
        await this.handleThermostatRuntimeData(deviceId, messageData, topic, messageId);
        break;
      default:
        logger.warn('未知的消息类型', { deviceId, messageType, topic });
        // 默认按数据处理
        await this.handleDeviceData(deviceId, messageData, topic, messageId);
    }
  }

  /**
   * 获取设备信息（带缓存）
   */
  async getDeviceWithCache(deviceId, includeTenant = false) {
    const cacheKey = `${deviceId}_${includeTenant}`;
    const cached = this.deviceCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < this.cacheExpiry) {
      return cached.device;
    }

    const { ProtocolConfig } = require('../models');
    const queryOptions = {
      where: {
        [Op.or]: [
          { device_id: deviceId },
          { imei: deviceId }
        ]
      },
      include: [{
        model: DeviceType,
        as: 'device_type',
        attributes: ['id', 'name']
      }, {
        model: ProtocolConfig,
        as: 'protocol_config',
        attributes: ['id', 'name', 'modbus_config', 'status']
      }],
      attributes: {
        exclude: ['device_category']  // 暂时排除可能有问题的字段
      }
    };

    if (includeTenant) {
      queryOptions.include.push({
        model: Tenant,
        as: 'tenant',
        attributes: ['id', 'name']
      });
    }

    const device = await Device.findOne(queryOptions);

    if (device) {
      this.deviceCache.set(cacheKey, {
        device,
        timestamp: Date.now()
      });
    }

    return device;
  }

  /**
   * 处理设备数据
   */
  async handleDeviceData(deviceId, data, topic, messageId) {
    try {
      // 查找设备（使用缓存）
      const device = await this.getDeviceWithCache(deviceId, true);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      const receivedAt = new Date();

      // 根据设备类型解析和存储数据
      await this.parseAndStoreDeviceData(device, data, topic);

      // 特殊处理照明开关设备数据（保持向后兼容）
      await this.handleLightingDeviceData(device, data, topic);

      // 清理设备数据中的无效Unicode字符
      const cleanedData = this.sanitizeDataForStorage(data);

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到设备数据',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: cleanedData,
          dataSize: JSON.stringify(cleanedData).length,
          timestamp: new Date().toISOString(),
          messageType: 'data'
        }
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      // 通过WebSocket推送给前端
      websocketService.broadcastToClients('device_data', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        imei: device.imei,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: data,
        data: data,
        dataSize: JSON.stringify(data).length,
        messageType: 'data',
        timestamp: receivedAt
      });

      // 同时推送通信日志
      websocketService.broadcastToClients('communication_log', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        imei: device.imei,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: data,
        dataSize: JSON.stringify(data).length,
        messageType: 'data',
        type: 'data',
        timestamp: receivedAt
      });

      logger.debug('设备数据处理完成', {
        deviceId: device.id,
        deviceName: device.name
      });

    } catch (error) {
      logger.error('处理设备数据失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
    }
  }

  isZqcV200SwitchData(messageData, topic) {
    return this.isZqcV200SwitchTopic(topic) &&
      messageData &&
      messageData.packType === 'devData' &&
      Array.isArray(messageData.devices);
  }

  async handleZqcSwitchElectricalData(deviceId, data, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId, true);
      if (!device) {
        logger.warn('ZQC开关电气数据设备不存在', { deviceId, topic });
        return;
      }

      await this.updateDeviceStatus(device, 'online');
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      const manufacturerCode = this.extractManufacturerFromTopic(topic) || device.manufacturer_code || 'ZQC';
      const records = [];
      let latestStatus = null;

      for (const item of data.devices) {
        const electricalData = this.normalizeZqcV200SwitchElectricalData(item, data);
        records.push(electricalData);
        const saved = await this.saveSwitchElectricalData(device, electricalData, manufacturerCode);
        if (!saved.success) {
          throw new Error(saved.error || saved.reason || 'ZQC开关电气数据入库失败');
        }

        const switchStatus = parseZqcSwitchStatus(item);
        if (switchStatus) {
          latestStatus = switchStatus;
          await telemetryStore.saveStatus({
            device: { ...device, manufacturer_code: manufacturerCode },
            moduleType: 'switch',
            state: switchStatus,
            source: 'mqtt',
            rawPayload: {
              ...item,
              gateway_timestamp: data.timestamp,
              version: data.ver,
              packType: data.packType
            }
          });
        }
      }

      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到ZQC开关电气数据',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic,
          payload: this.sanitizeDataForStorage(data),
          messageType: 'zqc_switch_data',
          recordCount: records.length,
          timestamp: new Date().toISOString()
        }
      });

      websocketService.broadcastToClients('lighting_electrical_data', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        imei: device.imei,
        tenant_id: device.tenant_id,
        manufacturer_code: manufacturerCode,
        electricalData: records[0] || null,
        records,
        power_status: latestStatus?.power_status ?? null,
        messageType: 'zqc_switch_data',
        timestamp: new Date()
      });

      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      logger.debug('ZQC开关电气数据处理完成', {
        deviceId: device.id,
        imei: device.imei,
        manufacturerCode,
        recordCount: records.length
      });
    } catch (error) {
      logger.error('处理ZQC开关电气数据失败', {
        deviceId,
        topic,
        error: error.message
      });
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
    }
  }

  normalizeZqcV200SwitchElectricalData(item, envelope = {}) {
    const scale = (value, divisor) => this.extractNumericValue(value) === null ? null : this.extractNumericValue(value) / divisor;
    const energyScale = value => this.extractNumericValue(value) === null ? null : this.extractNumericValue(value) / 1000;
    return {
      key1: null,
      key2: null,
      key3: null,
      voltage: scale(item.voltA ?? item.voltB ?? item.voltC, 100),
      current: scale(item.currA ?? item.currB ?? item.currC, 1000),
      power: scale(item.aPT ?? item.appPT ?? item.rPT, 1000),
      energy: energyScale(item.aET ?? item.appET ?? item.rET),
      voltage_a: scale(item.voltA, 100),
      voltage_b: scale(item.voltB, 100),
      voltage_c: scale(item.voltC, 100),
      current_a: scale(item.currA, 1000),
      current_b: scale(item.currB, 1000),
      current_c: scale(item.currC, 1000),
      power_a: scale(item.aPA ?? item.appPA ?? item.rPA, 1000),
      power_b: scale(item.aPB ?? item.appPB ?? item.rPB, 1000),
      power_c: scale(item.aPC ?? item.appPC ?? item.rPC, 1000),
      power_factor: null,
      power_factor_a: null,
      power_factor_b: null,
      power_factor_c: null,
      frequency: scale(item.freq, 10),
      leakage_current: scale(item.le ?? item.currN, 1000),
      temperature: scale(item.ltA ?? item.t, 10),
      temperature_a: scale(item.ltA, 10),
      temperature_b: scale(item.ltB, 10),
      temperature_c: scale(item.ltC, 10),
      raw_payload: {
        ...item,
        gateway_timestamp: envelope.timestamp,
        version: envelope.ver,
        packType: envelope.packType
      }
    };
  }

  /**
   * 处理电表数据响应
   */
  async handleElectricMeterDataResponse(deviceId, data, topic, messageId) {
    try {
      // 查找设备（使用缓存）
      const device = await this.getDeviceWithCache(deviceId, true);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 如果是原始RTU响应数据（Buffer或字符串格式），需要先解析
      let processedData = data;
      if (Buffer.isBuffer(data) || typeof data === 'string') {
        const dataType = Buffer.isBuffer(data) ? 'Buffer' : 'string';
        const dataPreview = Buffer.isBuffer(data) ? 
          data.toString('hex').substring(0, 50) : 
          data.substring(0, 50);
        
        logger.debug('处理原始RTU响应数据', {
          dataType,
          rawData: dataPreview,
          length: Buffer.isBuffer(data) ? data.length : data.length
        });
        
        processedData = await this.parseRawRTUResponse(device, data, topic);
        if (!processedData) {
          logger.warn('RTU响应数据解析失败，跳过处理');
          return;
        }
      }

      // 获取电表MQTT服务实例
      const electricMeterMqttService = global.electricMeterMqttServiceInstance;
      if (!electricMeterMqttService) {
        logger.warn('电表MQTT服务未初始化，跳过电表数据处理');
        return;
      }

      await electricMeterMqttService.handleElectricMeterData(device, processedData);

      // 清理电表数据中的无效Unicode字符
      const cleanedElectricMeterData = this.sanitizeDataForStorage(processedData);

      // 准备日志数据并清理其中的Unicode字符
      const logData = {
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: cleanedElectricMeterData,
        dataSize: JSON.stringify(cleanedElectricMeterData).length,
        timestamp: new Date().toISOString(),
        messageType: 'electric_meter_data',
        originalRawData: typeof data === 'string' ? this.sanitizeDataForStorage(data) : undefined
      };

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到电表数据响应',
        data: logData
      });

      logger.debug('电表数据响应处理完成', {
        deviceId: device.id,
        deviceName: device.name,
        meterId: processedData.meter_id,
        meterAddress: processedData.meter_address
      });

    } catch (error) {
      logger.error('处理电表数据响应失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 处理温控器运行时间统计数据
   */
  async handleThermostatRuntimeData(deviceId, data, topic, messageId) {
    try {
      // 查找设备（使用缓存）
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 记录消息处理开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordProcessingStarted(messageId);
      }

      // 解析运行时间数据
      const runtimeData = this.parseRuntimeData(data);
      if (!runtimeData) {
        logger.warn('运行时间数据解析失败', { deviceId, data });
        return;
      }

      // 存储到thermostat_runtime_stats表
      await this.saveThermostatRuntimeStats(device, runtimeData);

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到温控器运行时间统计数据',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: this.sanitizeDataForStorage(data),
          dataSize: JSON.stringify(data).length,
          timestamp: new Date().toISOString(),
          messageType: 'time',
          runtimeStats: runtimeData
        }
      });

      // 记录消息处理完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordProcessingCompleted(messageId, true);
      }

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, true);
      }

      logger.debug('温控器运行时间统计数据处理完成', {
        deviceId: device.id,
        deviceName: device.name,
        runtimeStats: runtimeData
      });

    } catch (error) {
      logger.error('处理温控器运行时间统计数据失败', {
        deviceId,
        error: error.message,
        stack: error.stack
      });

      // 记录处理失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordProcessingCompleted(messageId, false, error.message);
      }

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 解析运行时间数据
   */
  parseRuntimeData(data) {
    try {
      // 如果data是字符串，尝试解析为JSON
      let parsedData = data;
      if (typeof data === 'string') {
        parsedData = JSON.parse(data);
      }

      // 检查数据格式，支持两种格式：
      // 1. 直接键值对格式：{FanLow: 123, FanMiddle: 456, ...}
      // 2. 协议格式：{body: {items: [...], data: [[...]]}}
      let runtimeValues = {};

      if (parsedData.body && parsedData.body.items && parsedData.body.data) {
        // 协议格式：从items和data数组中提取数据
        const items = parsedData.body.items;
        const dataArray = parsedData.body.data[0]; // 取第一行数据

        if (items.length === dataArray.length) {
          for (let i = 0; i < items.length; i++) {
            runtimeValues[items[i]] = dataArray[i];
          }
        } else {
          logger.warn('运行时间数据格式不匹配', { items: items.length, data: dataArray.length });
          return null;
        }
      } else {
        // 直接键值对格式
        runtimeValues = parsedData;
      }

      // 提取运行时间数据
      const runtimeData = {
        fan_low: this.extractNumericValue(runtimeValues.FanLow) || 0,
        fan_middle: this.extractNumericValue(runtimeValues.FanMiddle) || 0,
        fan_high: this.extractNumericValue(runtimeValues.FanHigh) || 0,
        heat_low: this.extractNumericValue(runtimeValues.HeatLow) || 0,
        heat_middle: this.extractNumericValue(runtimeValues.HeatMiddle) || 0,
        heat_high: this.extractNumericValue(runtimeValues.HeatHigh) || 0,
        cool_low: this.extractNumericValue(runtimeValues.CoolLow) || 0,
        cool_middle: this.extractNumericValue(runtimeValues.CoolMiddle) || 0,
        cool_high: this.extractNumericValue(runtimeValues.CoolHigh) || 0
      };

      // 计算总运行时间
      runtimeData.total_runtime = runtimeData.fan_low + runtimeData.fan_middle + runtimeData.fan_high;
      runtimeData.runtime_cool = runtimeData.cool_low + runtimeData.cool_middle + runtimeData.cool_high;
      runtimeData.runtime_heat = runtimeData.heat_low + runtimeData.heat_middle + runtimeData.heat_high;
      runtimeData.runtime_fan = runtimeData.fan_low + runtimeData.fan_middle + runtimeData.fan_high;

      // 根据数据库表结构映射字段
      runtimeData.runtime_speed1 = runtimeData.fan_low;
      runtimeData.runtime_speed2 = runtimeData.fan_middle;
      runtimeData.runtime_speed3 = runtimeData.fan_high;

      logger.debug('运行时间数据解析成功', {
        originalData: runtimeValues, 
        parsedData: runtimeData 
      });

      return runtimeData;
    } catch (error) {
      logger.error('解析运行时间数据失败', { error: error.message, data });
      return null;
    }
  }

  /**
   * 保存温控器运行时间统计数据到数据库
   */
  async saveThermostatRuntimeStats(device, runtimeData) {
    try {
      const statDate = new Date().toISOString().split('T')[0]; // 当前日期
      
      const query = `
        INSERT INTO thermostat_runtime_stats (
          device_id, stat_date, runtime_speed1, 
          runtime_speed2, runtime_speed3, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        ON CONFLICT (device_id, stat_date) 
        DO UPDATE SET 
          runtime_speed1 = EXCLUDED.runtime_speed1,
          runtime_speed2 = EXCLUDED.runtime_speed2,
          runtime_speed3 = EXCLUDED.runtime_speed3,
          updated_at = NOW()
      `;

      const values = [
        device.id,
        statDate,
        runtimeData.runtime_speed1 || 0,
        runtimeData.runtime_speed2 || 0,
        runtimeData.runtime_speed3 || 0
      ];

      await pool.query(query, values);

      logger.debug('温控器运行时间统计数据保存成功', {
        deviceId: device.id,
        statDate,
        runtimeData
      });

    } catch (error) {
      logger.error('保存温控器运行时间统计数据失败', {
        deviceId: device.id,
        error: error.message,
        runtimeData
      });
      throw error;
    }
  }

  /**
   * 处理设备状态
   */
  async handleDeviceStatus(deviceId, statusData, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      // 更新设备状态
      const newStatus = statusData.status || 'online';
      await this.updateDeviceStatus(device, newStatus);

      // 清理状态数据中的无效Unicode字符
      const cleanedStatusData = this.sanitizeDataForStorage(statusData);

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: `设备状态更新: ${newStatus}`,
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: cleanedStatusData,
          dataSize: JSON.stringify(cleanedStatusData).length,
          timestamp: new Date().toISOString(),
          messageType: 'status',
          statusChange: {
            from: device.status,
            to: newStatus
          }
        }
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      // 通过WebSocket推送状态更新
      websocketService.broadcastToClients('device_status_update', {
        device_id: device.id,
        device_name: device.name,
        status: newStatus,
        timestamp: new Date().toISOString()
      });

      logger.debug('设备状态更新完成', {
        deviceId: device.id,
        status: newStatus
      });

    } catch (error) {
      logger.error('处理设备状态失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 处理设备心跳
   */
  async handleDeviceHeartbeat(deviceId, heartbeatData, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      // 更新设备最后在线时间
      await device.update({
        last_seen_at: new Date(),
        status: 'online'
      });

      // 清理心跳数据中的无效Unicode字符
      const cleanedHeartbeatData = this.sanitizeDataForStorage(heartbeatData);

      // 记录设备心跳日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: `设备心跳${device.device_type?.name === 'DTU电表' ? ' (DTU心跳包)' : ''}`,
        data: {
          event: 'device_heartbeat',
          topic: topic,
          source: 'mqtt',
          timestamp: new Date().toISOString(),
          messageType: 'heartbeat',
          heartbeatData: cleanedHeartbeatData,
          deviceType: device.device_type?.name
        }
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      // 计算数据大小，处理字符串类型的心跳数据
      const dataSize = typeof heartbeatData === 'string' ? heartbeatData.length : JSON.stringify(heartbeatData).length;
      
      // 通过WebSocket推送设备心跳
      websocketService.broadcastToClients('device_heartbeat', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,  // 使用device_id替代imei
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: heartbeatData,
        dataSize: dataSize,
        messageType: 'heartbeat',
        timestamp: new Date().toISOString()
      });

      // 同时推送通信日志
      websocketService.broadcastToClients('communication_log', {
        deviceId: device.id,
        device_id: device.id,
        device_id_value: device.device_id,  // 使用device_id替代imei
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: heartbeatData,
        dataSize: dataSize,
        messageType: 'heartbeat',
        type: 'heartbeat',
        timestamp: new Date().toISOString()
      });

      logger.debug('设备心跳处理完成', {
        deviceId: device.id,
        deviceName: device.name
      });

    } catch (error) {
      logger.error('处理设备心跳失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 处理设备响应
   */
  async handleDeviceResponse(deviceId, responseData, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      // 清理响应数据中的无效Unicode字符
      const cleanedResponseData = this.sanitizeDataForStorage(responseData);

      // 记录设备响应日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到设备响应',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: cleanedResponseData,
          dataSize: JSON.stringify(cleanedResponseData).length,
          timestamp: new Date().toISOString(),
          messageType: 'response'
        }
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      // 通过WebSocket推送设备响应
      websocketService.broadcastToClients('device_response', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        imei: device.imei,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: responseData,
        response: responseData,
        dataSize: JSON.stringify(responseData).length,
        messageType: 'response',
        timestamp: new Date().toISOString()
      });

      // 同时推送通信日志
      websocketService.broadcastToClients('communication_log', {
        deviceId: device.id,
        device_id: device.id,
        imei: device.imei,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: responseData,
        dataSize: JSON.stringify(responseData).length,
        messageType: 'response',
        type: 'response',
        timestamp: new Date().toISOString()
      });

      logger.info('设备响应处理完成', {
        deviceId: device.id,
        deviceName: device.name
      });

    } catch (error) {
      logger.error('处理设备响应失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 处理设备事件
   */
  async handleDeviceEvent(deviceId, eventData, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      } else if (messageId && !this.messageProcessingService) {
        logger.warn('消息处理服务未初始化，跳过记录存储开始状态', { messageId, deviceId });
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 检查是否包含开关状态数据
      const hasSwitchData = eventData.key1 !== undefined || eventData.key2 !== undefined || eventData.key3 !== undefined;

      // 检查是否包含电气数据
      const hasElectricalData = eventData.voltage !== undefined || eventData.current !== undefined || eventData.power !== undefined || eventData.energy !== undefined;

      if (hasSwitchData) {
        // 如果包含开关状态数据，调用照明开关状态处理方法
        logger.debug('事件消息包含开关状态数据，调用开关状态处理方法', {
          deviceId,
          switchData: {
            key1: eventData.key1,
            key2: eventData.key2,
            key3: eventData.key3
          }
        });
        await this.handleLightingSwitchStatus(deviceId, eventData, topic);
      }

      if (hasElectricalData) {
        // 如果包含电气数据，调用照明电气数据处理方法
        logger.debug('事件消息包含电气数据，调用电气数据处理方法', {
          deviceId,
          electricalData: {
            voltage: eventData.voltage,
            current: eventData.current,
            power: eventData.power,
            energy: eventData.energy
          }
        });
        await this.handleLightingElectricalData(deviceId, eventData, topic);
      }

      // 清理事件数据中的无效Unicode字符
      const cleanedEventData = this.sanitizeDataForStorage(eventData);

      // 记录事件日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: `设备事件: ${cleanedEventData.code || '未知事件'}`,
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: cleanedEventData,
          dataSize: JSON.stringify(cleanedEventData).length,
          timestamp: new Date().toISOString(),
          messageType: 'event',
          eventCode: cleanedEventData.code,
          eventType: cleanedEventData.type,
          imei: cleanedEventData.imei,
          control: cleanedEventData.control,
          version: cleanedEventData.version,
          hasSwitchData: hasSwitchData,
          hasElectricalData: hasElectricalData
        }
      });

      // 通过WebSocket推送设备事件
      websocketService.broadcastToClients('device_event', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        imei: eventData.imei || device.imei,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: eventData,
        dataSize: JSON.stringify(eventData).length,
        messageType: 'event',
        eventCode: eventData.code,
        eventType: eventData.type,
        timestamp: new Date().toISOString()
      });

      // 同时推送通信日志
      websocketService.broadcastToClients('communication_log', {
        deviceId: device.id,
        device_id: device.id,
        imei: eventData.imei || device.imei,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: eventData,
        dataSize: JSON.stringify(eventData).length,
        messageType: 'event',
        type: 'event',
        timestamp: new Date().toISOString()
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      logger.debug('设备事件处理完成', {
        deviceId: device.id,
        deviceName: device.name,
        eventCode: eventData.code,
        hasSwitchData: hasSwitchData
      });

    } catch (error) {
      logger.error('处理设备事件失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 更新设备状态
   */
  async updateDeviceStatus(device, status, options = {}) {
    try {
      const oldStatus = device.status;
      const touchLastSeen = options.touchLastSeen !== undefined ? options.touchLastSeen : status === 'online';
      const updateData = { status: status };

      if (touchLastSeen) {
        updateData.last_seen_at = options.lastSeenAt || new Date();
      }

      await device.update(updateData);

      // 记录设备状态变化日志
      if (oldStatus !== status) {
        await persistDeviceLog({
          device_id: device.id,
          level: 'info',
          message: `设备状态更新: ${status}`,
          data: {
            event: 'device_status_change',
            source: 'system',
            timestamp: new Date().toISOString(),
            messageType: 'status',
            statusChange: {
              from: oldStatus,
              to: status
            }
          }
        });

        await alarmService.handleCommunicationStatus(device, status).catch((alarmError) => {
          logger.error('设备通信状态告警处理失败', {
            deviceId: device.id,
            status,
            error: alarmError.message
          });
        });
      }

      logger.debug('设备状态已更新', {
        deviceId: device.id,
        status
      });

    } catch (error) {
      logger.error('更新设备状态失败', {
        deviceId: device.id,
        status,
        error: error.message
      });
    }
  }

  /**
   * 构造设备命令主题
   * @param {Object} device - 设备对象
   */
  buildCommandTopic(device) {
    
    // 对于子设备，使用父网关的IMEI来构建MQTT主题
    const effectiveImei = device.device_category === 'sub_device' && device.parent_device
        ? (device.parent_device.imei || device.parent_device.device_id)
        : (device.imei || device.device_id);
try {
      // 优先使用设备的MQTT配置
      const deviceMqttConfig = device.mqtt_config || {};
      const renderTopic = (template) => this.renderTopicTemplate(template, device);
      
      // 优先使用command_topic字段
      if (deviceMqttConfig.command_topic) {
        return renderTopic(deviceMqttConfig.command_topic);
      }
      
      // 从subscribe_topics数组中查找命令主题
      if (deviceMqttConfig.subscribe_topics && Array.isArray(deviceMqttConfig.subscribe_topics)) {
        const commandTopic = deviceMqttConfig.subscribe_topics.find(topic => {
          const topicText = typeof topic === 'string' ? topic : topic.topic;
          return (
            (topic.description && (topic.description.includes('命令') || topic.description.includes('command') || topic.description.includes('下行'))) ||
            (topic.name && (topic.name.includes('命令') || topic.name.includes('下行'))) ||
            (topicText && topicText.includes('subscribe'))
          );
        }
        );
        
        if (commandTopic) {
          return renderTopic(typeof commandTopic === 'string' ? commandTopic : commandTopic.topic);
        }
      }

      const manufacturerMqttConfig = device.manufacturer?.mqtt_config || {};
      const manufacturerSubscribeTopics = manufacturerMqttConfig.subscribeTopics || manufacturerMqttConfig.subscribe_topics || [];
      if (Array.isArray(manufacturerSubscribeTopics) && manufacturerSubscribeTopics.length > 0) {
        const commandTopic = manufacturerSubscribeTopics.find(topic => topic.enabled !== false) || manufacturerSubscribeTopics[0];
        return renderTopic(typeof commandTopic === 'string' ? commandTopic : commandTopic.topic);
      }

      if (manufacturerMqttConfig.subscribeTopic || manufacturerMqttConfig.subscribe_topic) {
        return renderTopic(manufacturerMqttConfig.subscribeTopic || manufacturerMqttConfig.subscribe_topic);
      }
      
      // 根据厂商的subscription_type构建主题
      if (device.manufacturer?.code && device.manufacturer?.subscription_type) {
        const manufacturerCode = device.manufacturer.code;
        const subscriptionType = device.manufacturer.subscription_type;
        
        // 根据厂商的订阅类型构建主题
        if (subscriptionType === 'imei_middle') {
          return `zhhl/${manufacturerCode}/${effectiveImei}/subscribe`;
      } else if (subscriptionType === "custom") {
        // ???????????mqtt_config??????
        const mfgConfig = device.manufacturer?.mqtt_config || {};
        const subTopics = mfgConfig.subscribeTopics || mfgConfig.subscribe_topics || [];
        const defaultTopic = subTopics.find(t => t.enabled !== false);
        if (defaultTopic && defaultTopic.topic) {
          return defaultTopic.topic.replace(/{imei}/g, effectiveImei).replace(/{IMEI}/g, effectiveImei);
        }
        return "custom/" + effectiveImei + "/subscribe";
        }
           else if (subscriptionType === 'imei_last') {
            return `zhhl/${manufacturerCode}/subscribe/${effectiveImei}`;
          }
      }
      
      // 如果设备有厂商代码但没有厂商信息，使用设备的厂商代码
      if (device.manufacturer_code) {
        return `zhhl/${device.manufacturer_code}/${effectiveImei}/subscribe`;
      }
      
      // 如果没有厂商信息，抛出错误
      throw new Error(`设备 ${device.imei} 缺少厂商信息，无法构建MQTT主题`);
      
    } catch (error) {
      logger.error('构造命令主题失败:', error);
      // 如果有厂商代码，使用厂商代码构建主题
      if (device.manufacturer_code) {
        return `zhhl/${device.manufacturer_code}/${effectiveImei}/subscribe`;
      }
      // 如果没有任何厂商信息，抛出错误
      throw new Error(`设备 ${device.imei} 缺少厂商信息，无法构建MQTT主题: ${error.message}`);
    }
  }

  renderTopicTemplate(template, device) {
    if (!template) return template;
    const manufacturerCode = device.manufacturer?.code || device.manufacturer_code || '';
    const replacements = {
      manufacturerCode,
      manufacturer: manufacturerCode,
      code: manufacturerCode,
      imei: device.imei || '',
      deviceId: device.device_id || '',
      device_id: device.device_id || '',
      gatewayMac: device.gateway_mac || device.parent_device?.imei || device.imei || '',
      mac: device.gateway_mac || device.parent_device?.imei || device.imei || '',
      addr: device.sub_device_sequence || device.address || device.device_address || '',
      id: device.id || ''
    };
    return String(template)
      .replace(/\{(\w+)\}/g, (_, key) => replacements[key] ?? '')
      .replace(/\$\{(\w+)\}/g, (_, key) => replacements[key] ?? '');
  }

  /**
   * 发送氟系统空调控制命令
   * @param {string} deviceId - 设备ID
   * @param {object} command - 氟系统空调控制命令
   */
  async sendFluorineSystemCommand(deviceId, command) {
    try {
      logger.info('发送氟系统空调控制命令', { deviceId, command });

      // 查找设备
      const device = await this.getDeviceWithCache(deviceId, true);
      if (!device) {
        throw new Error('设备不存在');
      }

      // 构建MQTT主题
      const topic = this.buildCommandTopic(device);
      
      // 确保消息格式正确
      const message = JSON.stringify(command);

      // 发送MQTT消息
      this.client.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          logger.error('发送氟系统空调命令失败', {
            deviceId,
            command,
            error: err.message
          });
        } else {
          logger.info('氟系统空调命令发送成功', {
            deviceId,
            command,
            topic,
            manufacturer: device.manufacturer ? {
              code: device.manufacturer.code,
              subscription_type: device.manufacturer.subscription_type
            } : null
          });
        }
      });

      // 清理命令数据中的无效Unicode字符
      const cleanedCommand = this.sanitizeDataForStorage(command);

      // 记录命令发送日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: `发送氟系统空调命令: ${JSON.stringify(cleanedCommand).substring(0, 50)}${JSON.stringify(cleanedCommand).length > 50 ? '...' : ''}`,
        data: {
          direction: 'outgoing',
          source: 'mqtt',
          topic: topic,
          payload: cleanedCommand,
          dataSize: JSON.stringify(cleanedCommand).length,
          timestamp: new Date().toISOString(),
          messageType: 'fluorine_system_command'
        }
      });

      // 通过WebSocket推送命令发送通知
      websocketService.broadcastToClients('communication_log', {
        deviceId: device.id,
        device_id: device.id,
        imei: device.imei,
        tenant_id: device.tenant_id,
        direction: 'outgoing',
        source: 'mqtt',
        topic: topic,
        payload: command,
        dataSize: JSON.stringify(command).length,
        messageType: 'fluorine_system_command',
        type: 'command',
        timestamp: new Date().toISOString()
      });

      return true;

    } catch (error) {
      logger.error('发送氟系统空调命令失败', {
        deviceId,
        command,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 发送命令到设备
   */
  async sendCommandToDevice(deviceId, command, options = {}) {
    try {
      if (!this.isConnected) {
        throw new Error('MQTT未连接');
      }

      logger.info('查找设备', { deviceId, searchBy: 'device_id或imei' });

      const { Manufacturer } = require('../models');
      const device = await Device.findOne({
        where: {
          [require('sequelize').Op.or]: [
            { device_id: deviceId },
            { imei: deviceId }
          ]
        },
        include: [{
          model: Manufacturer,
          as: 'manufacturer',
          attributes: ['code', 'subscription_type', 'mqtt_config']
        }, {
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'imei', 'device_id', 'device_category'],
          required: false
        }]
      });

      logger.info('设备查找结果', {
        deviceId,
        found: !!device,
        deviceInfo: device ? { 
          id: device.id, 
          device_id: device.device_id, 
          imei: device.imei,
          manufacturer: device.manufacturer ? {
            code: device.manufacturer.code,
            subscription_type: device.manufacturer.subscription_type
          } : null
        } : null
      });

      if (!device) {
        throw new Error('设备不存在');
      }

      // 构建MQTT主题
      const topic = options.mqttTopic || command?.mqttTopic || command?.topic || this.buildCommandTopic(device);
      // 直接发送原始命令数据，不进行额外封装
      let message;
      if (typeof command === 'string') {
        message = command;
      } else {
        const { mqttTopic, topic: _topic, ...payload } = command;
        message = JSON.stringify(payload);
      }

      this.client.publish(topic, message, { qos: 1 }, (err) => {
        if (err) {
          logger.error('发送设备命令失败', {
            deviceId,
            command,
            error: err.message
          });
        } else {
          logger.info('设备命令发送成功', {
            deviceId,
            command: typeof command === 'string' ? command : JSON.stringify(command),
            topic,
            manufacturer: device.manufacturer ? {
              code: device.manufacturer.code,
              subscription_type: device.manufacturer.subscription_type
            } : null
          });
        }
      });

      // 清理命令数据中的无效Unicode字符
      const cleanedCommand = this.sanitizeDataForStorage(command);

      // 记录命令发送日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: `发送命令: ${typeof cleanedCommand === 'string' ? cleanedCommand.substring(0, 50) : JSON.stringify(cleanedCommand).substring(0, 50)}${(typeof cleanedCommand === 'string' ? cleanedCommand.length : JSON.stringify(cleanedCommand).length) > 50 ? '...' : ''}`,
        data: {
          direction: 'outgoing',
          source: 'mqtt',
          topic: topic,
          payload: cleanedCommand,
          dataSize: typeof cleanedCommand === 'string' ? cleanedCommand.length : JSON.stringify(cleanedCommand).length,
          timestamp: new Date().toISOString(),
          messageType: 'command'
        }
      });

      // 通过WebSocket推送命令发送通知
      websocketService.broadcastToClients('communication_log', {
        deviceId: device.id,
        device_id: device.id,
        imei: device.imei,
        tenant_id: device.tenant_id,
        direction: 'outgoing',
        source: 'mqtt',
        topic: topic,
        payload: command,
        dataSize: typeof command === 'string' ? command.length : JSON.stringify(command).length,
        messageType: 'command',
        type: 'command',
        timestamp: new Date().toISOString()
      });

      return true;

    } catch (error) {
      logger.error('发送设备命令失败', {
        deviceId,
        command,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 启动设备离线检测
   */
  startOfflineCheck() {
    if (this.offlineCheckTimer) {
      clearInterval(this.offlineCheckTimer);
    }

    this.offlineCheckTimer = setInterval(async () => {
      await this.checkOfflineDevices();
    }, this.offlineCheckInterval);

    logger.info('设备离线检测已启动');
    
    // 启动多联机主机心跳超时检测
    // 多联机主机心跳超时检查功能已移除
  }

  /**
   * 停止设备离线检测
   */
  stopOfflineCheck() {
    if (this.offlineCheckTimer) {
      clearInterval(this.offlineCheckTimer);
      this.offlineCheckTimer = null;
      logger.info('设备离线检测已停止');
    }
  }

  /**
   * 检查离线设备
   */
  async checkOfflineDevices() {
    logger.debug('执行设备离线检查');
    await this.checkDevicesStatus();
  }

  /**
   * 发送设备离线通知
   * @param {Object} device - 设备信息
   */
  sendDeviceOfflineNotification(device) {
    if (!device) return;
    
    logger.debug('发送设备离线通知', { deviceId: device.id });
  }

  async checkMultiUnitHosts() {
    try {
      const offlineHosts = [];
      
      if (offlineHosts.length > 0) {
        logger.info('检测到心跳超时的多联机主机', {
          count: offlineHosts.length,
          hosts: offlineHosts.map(h => ({
            id: h.id,
            name: h.host_name,
            lastHeartbeat: h.last_heartbeat
          }))
        });
      }
    } catch (error) {
      logger.error('检查多联机主机心跳超时失败', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * 检查设备在线状态
   */
  async checkDevicesStatus() {
    try {
      const now = Date.now();
      const offlineDevices = [];
      const onlineDevices = [];

      const devices = await Device.findAll({
        where: {
          [Op.or]: [
            { status: 'online' },
            { device_category: 'sub_device' }
          ]
        },
        include: [{
          model: Device,
          as: 'parent_device',
          attributes: ['id', 'name', 'device_id', 'imei', 'status', 'last_seen_at'],
          required: false
        }]
      });

      const getLastSeenMs = (device) => {
        if (!device) return null;
        return this.deviceLastSeen.get(device.device_id) ||
          (device.imei ? this.deviceLastSeen.get(device.imei) : null) ||
          (device.last_seen_at ? new Date(device.last_seen_at).getTime() : null);
      };

      for (const device of devices) {
        const isSubDevice = device.device_category === 'sub_device' && device.parent_device_id;
        const communicationDevice = isSubDevice ? device.parent_device : device;
        const lastSeen = getLastSeenMs(communicationDevice);
        const isCommunicationOnline = !!(
          communicationDevice &&
          communicationDevice.status === 'online' &&
          lastSeen &&
          (now - lastSeen) <= this.offlineTimeout
        );

        if (isSubDevice && isCommunicationOnline && device.status !== 'online') {
          await this.updateDeviceStatus(device, 'online', {
            touchLastSeen: true,
            lastSeenAt: new Date(lastSeen)
          });
          onlineDevices.push(device);

          websocketService.broadcastToClients('device_status_update', {
            device_id: device.id,
            device_name: device.name,
            status: 'online',
            timestamp: new Date().toISOString()
          });

          continue;
        }

        // 如果设备超过离线超时时间没有活动，标记为离线
        if (device.status === 'online' && (!lastSeen || (now - lastSeen) > this.offlineTimeout || (isSubDevice && !isCommunicationOnline))) {
          await this.updateDeviceStatus(device, 'offline', { touchLastSeen: false });
          offlineDevices.push(device);

          // 记录设备离线检测日志
          await persistDeviceLog({
            device_id: device.id,
            level: 'warning',
            message: isSubDevice ? '设备离线检测：上级网关通信超时，子设备离线' : '设备离线检测：设备超时离线',
            data: {
              event: 'device_timeout_offline',
              source: 'system',
              timestamp: new Date().toISOString(),
              communication_via: isSubDevice ? 'parent_gateway' : 'self',
              parent_device_id: isSubDevice ? device.parent_device_id : null,
              last_seen_at: lastSeen ? new Date(lastSeen).toISOString() : null,
              offline_detected_at: new Date().toISOString()
            }
          });

          // 通过WebSocket推送离线通知
          websocketService.broadcastToClients('device_offline', {
            device_id: device.id,
            device_name: device.name,
            timestamp: new Date().toISOString()
          });

          // 清除设备活跃记录
          this.deviceLastSeen.delete(device.device_id);
        }
      }

      if (onlineDevices.length > 0) {
        logger.info('通过上级网关通信判定子设备在线', {
          count: onlineDevices.length,
          devices: onlineDevices.map(d => d.name)
        });
      }

      if (offlineDevices.length > 0) {
        logger.info('检测到离线设备', {
          count: offlineDevices.length,
          devices: offlineDevices.map(d => d.name)
        });
      }

    } catch (error) {
      logger.error('检查离线设备失败', { error: error.message });
    }
  }

  /**
   * 断开MQTT连接
   */
  async disconnect() {
    try {
      this.stopOfflineCheck();

      if (this.client) {
        this.client.end();
        this.client = null;
      }

      this.isConnected = false;
      logger.info('MQTT连接已断开');

    } catch (error) {
      logger.error('断开MQTT连接失败', { error: error.message });
    }
  }

  /**
   * 记录接收消息统计
   */
  recordInboundMessage() {
    const now = new Date();
    const timeKey = this.getTimeKey(now);

    // 更新总计数
    this.messageStats.totalInbound++;

    // 更新时间段统计
    const currentCount = this.messageStats.inbound.get(timeKey) || 0;
    this.messageStats.inbound.set(timeKey, currentCount + 1);

    if (persistDetailedMessageStats) {
      this.persistMessageStats('inbound', now).catch(error => {
        logger.error('持久化入站消息统计失败:', error);
      });
    }
  }

  /**
   * 记录发送消息统计
   */
  recordOutboundMessage() {
    const now = new Date();
    const timeKey = this.getTimeKey(now);

    // 更新总计数
    this.messageStats.totalOutbound++;

    // 更新时间段统计
    const currentCount = this.messageStats.outbound.get(timeKey) || 0;
    this.messageStats.outbound.set(timeKey, currentCount + 1);

    if (persistDetailedMessageStats) {
      this.persistMessageStats('outbound', now).catch(error => {
        logger.error('持久化出站消息统计失败:', error);
      });
    }
  }

  /**
   * 持久化消息统计到数据库
   */
  async persistMessageStats(direction, timestamp) {
    try {
      const { MessageFlowStatistic } = require('../models');

      // 计算时间桶（按分钟聚合）
      let timeBucket;
      if (timestamp) {
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
          logger.warn(`persistMessageStats中发现无效的timestamp: ${timestamp}，使用当前时间`);
          timeBucket = new Date();
        } else {
          timeBucket = parsedTimestamp;
        }
      } else {
        timeBucket = new Date();
      }
      timeBucket.setSeconds(0, 0); // 重置秒和毫秒为0

      // 查找或创建统计记录
      const [statRecord, created] = await MessageFlowStatistic.findOrCreate({
        where: {
          time_bucket: timeBucket,
          bucket_type: 'minute'
        },
        defaults: {
          time_bucket: timeBucket,
          bucket_type: 'minute',
          total_received: 0,
          total_processed: 0,
          total_stored: 0,
          total_failed: 0,
          total_sent: 0,
          total_sent_success: 0,
          total_sent_failed: 0,
          total_anomalies: 0,
          anomaly_low: 0,
          anomaly_medium: 0,
          anomaly_high: 0,
          anomaly_critical: 0
        }
      });

      // 更新统计数据
      if (direction === 'inbound') {
        await statRecord.increment('total_received', { by: 1 });
        await statRecord.increment('total_processed', { by: 1 });
        await statRecord.increment('total_stored', { by: 1 });
      } else if (direction === 'outbound') {
        await statRecord.increment('total_sent', { by: 1 });
        await statRecord.increment('total_sent_success', { by: 1 });
      }

      // 同时创建小时级别的聚合统计
      await this.aggregateHourlyStats(timestamp, direction);

      // 同时创建日级别的聚合统计
      await this.aggregateDailyStats(timestamp, direction);

    } catch (error) {
      logger.error('持久化消息统计失败:', error);
      throw error;
    }
  }

  /**
   * 聚合小时级别统计
   */
  async aggregateHourlyStats(timestamp, direction) {
    try {
      const { MessageFlowStatistic } = require('../models');

      // 计算小时时间桶
      let timeBucket;
      if (timestamp) {
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
          logger.warn(`aggregateHourlyStats中发现无效的timestamp: ${timestamp}，使用当前时间`);
          timeBucket = new Date();
        } else {
          timeBucket = parsedTimestamp;
        }
      } else {
        timeBucket = new Date();
      }
      timeBucket.setMinutes(0, 0, 0); // 重置分钟、秒和毫秒为0

      const [statRecord] = await MessageFlowStatistic.findOrCreate({
        where: {
          time_bucket: timeBucket,
          bucket_type: 'hour'
        },
        defaults: {
          time_bucket: timeBucket,
          bucket_type: 'hour',
          total_received: 0,
          total_processed: 0,
          total_stored: 0,
          total_failed: 0,
          total_sent: 0,
          total_sent_success: 0,
          total_sent_failed: 0,
          total_anomalies: 0,
          anomaly_low: 0,
          anomaly_medium: 0,
          anomaly_high: 0,
          anomaly_critical: 0
        }
      });

      // 更新统计数据
      if (direction === 'inbound') {
        await statRecord.increment('total_received', { by: 1 });
        await statRecord.increment('total_processed', { by: 1 });
        await statRecord.increment('total_stored', { by: 1 });
      } else if (direction === 'outbound') {
        await statRecord.increment('total_sent', { by: 1 });
        await statRecord.increment('total_sent_success', { by: 1 });
      }
    } catch (error) {
      logger.error('聚合小时级别统计失败:', error);
    }
  }

  /**
   * 聚合日级别统计
   */
  async aggregateDailyStats(timestamp, direction) {
    try {
      const { MessageFlowStatistic } = require('../models');

      // 计算日时间桶
      let timeBucket;
      if (timestamp) {
        const parsedTimestamp = new Date(timestamp);
        if (isNaN(parsedTimestamp.getTime())) {
          logger.warn(`aggregateDailyStats中发现无效的timestamp: ${timestamp}，使用当前时间`);
          timeBucket = new Date();
        } else {
          timeBucket = parsedTimestamp;
        }
      } else {
        timeBucket = new Date();
      }
      timeBucket.setHours(0, 0, 0, 0); // 重置小时、分钟、秒和毫秒为0

      const [statRecord] = await MessageFlowStatistic.findOrCreate({
        where: {
          time_bucket: timeBucket,
          bucket_type: 'day'
        },
        defaults: {
          time_bucket: timeBucket,
          bucket_type: 'day',
          total_received: 0,
          total_processed: 0,
          total_stored: 0,
          total_failed: 0,
          total_sent: 0,
          total_sent_success: 0,
          total_sent_failed: 0,
          total_anomalies: 0,
          anomaly_low: 0,
          anomaly_medium: 0,
          anomaly_high: 0,
          anomaly_critical: 0
        }
      });

      // 更新统计数据
      if (direction === 'inbound') {
        await statRecord.increment('total_received', { by: 1 });
        await statRecord.increment('total_processed', { by: 1 });
        await statRecord.increment('total_stored', { by: 1 });
      } else if (direction === 'outbound') {
        await statRecord.increment('total_sent', { by: 1 });
        await statRecord.increment('total_sent_success', { by: 1 });
      }
    } catch (error) {
      logger.error('聚合日级别统计失败:', error);
    }
  }

  /**
   * 生成时间键（精确到分钟）
   */
  getTimeKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hour}:${minute}`;
  }

  /**
   * 获取消息流量统计数据（从数据库获取历史数据）
   */
  async getMessageFlowStats(timeRange = '24h') {
    if (!persistDetailedMessageStats) {
      return this.getMessageFlowStatsFromMemory(timeRange);
    }

    try {
      const { MessageFlowStatistic } = require('../models');
      const { Op } = require('sequelize');

      const now = new Date();
      let hours, bucketType, dataPoints;

      // 根据时间范围计算参数
      switch (timeRange) {
        case '1h':
          hours = 1;
          bucketType = 'minute';
          dataPoints = 12;
          break;
        case '6h':
          hours = 6;
          bucketType = 'minute';
          dataPoints = 12;
          break;
        case '24h':
          hours = 24;
          bucketType = 'hour';
          dataPoints = 12;
          break;
        case '7d':
          hours = 24 * 7;
          bucketType = 'day';
          dataPoints = 7;
          break;
        default:
          hours = 24;
          bucketType = 'hour';
          dataPoints = 12;
      }

      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

      // 从数据库获取统计数据
      const stats = await MessageFlowStatistic.findAll({
        where: {
          time_bucket: {
            [Op.gte]: startTime,
            [Op.lte]: endTime
          },
          bucket_type: bucketType
        },
        order: [['time_bucket', 'ASC']]
      });

      // 创建时间标签和数据数组
      const timeLabels = [];
      const inbound = [];
      const outbound = [];

      // 计算时间间隔
      let intervalMinutes;
      switch (bucketType) {
        case 'minute':
          intervalMinutes = timeRange === '1h' ? 5 : 30;
          break;
        case 'hour':
          intervalMinutes = 120; // 2小时间隔
          break;
        case 'day':
          intervalMinutes = 24 * 60; // 1天间隔
          break;
      }

      // 生成时间点和聚合数据
      for (let i = 0; i < dataPoints; i++) {
        const time = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);
        const periodEnd = new Date(time.getTime() + intervalMinutes * 60 * 1000);

        // 生成时间标签
        if (timeRange === '7d') {
          timeLabels.push(time.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }));
        } else {
          timeLabels.push(time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
        }

        // 聚合该时间段的数据
        let inboundCount = 0;
        let outboundCount = 0;

        stats.forEach(stat => {
          const statTime = new Date(stat.time_bucket);
          if (statTime >= time && statTime < periodEnd) {
            inboundCount += stat.total_received || 0;
            outboundCount += stat.total_sent || 0;
          }
        });

        inbound.push(inboundCount);
        outbound.push(outboundCount);
      }

      // 计算总计数（从数据库获取最近7天的总数）
      const totalStats = await MessageFlowStatistic.findAll({
        where: {
          time_bucket: {
            [Op.gte]: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          }
        },
        attributes: [
          [MessageFlowStatistic.sequelize.fn('SUM', MessageFlowStatistic.sequelize.col('total_received')), 'totalInbound'],
          [MessageFlowStatistic.sequelize.fn('SUM', MessageFlowStatistic.sequelize.col('total_sent')), 'totalOutbound']
        ],
        raw: true
      });

      const totalInbound = totalStats[0]?.totalInbound || this.messageStats.totalInbound || 0;
      const totalOutbound = totalStats[0]?.totalOutbound || this.messageStats.totalOutbound || 0;

      return {
        timeLabels,
        inbound,
        outbound,
        totalInbound: parseInt(totalInbound),
        totalOutbound: parseInt(totalOutbound)
      };
    } catch (error) {
      logger.error('获取消息流量统计数据失败:', error);
      // 如果数据库查询失败，回退到内存统计
      return this.getMessageFlowStatsFromMemory(timeRange);
    }
  }

  /**
   * 从内存获取消息流量统计数据（备用方法）
   */
  getMessageFlowStatsFromMemory(timeRange = '24h') {
    const now = new Date();
    let hours, intervalMinutes, dataPoints;

    // 根据时间范围计算参数
    switch (timeRange) {
      case '1h':
        hours = 1;
        intervalMinutes = 5;
        dataPoints = 12;
        break;
      case '6h':
        hours = 6;
        intervalMinutes = 30;
        dataPoints = 12;
        break;
      case '24h':
        hours = 24;
        intervalMinutes = 120;
        dataPoints = 12;
        break;
      case '7d':
        hours = 24 * 7;
        intervalMinutes = 24 * 60;
        dataPoints = 7;
        break;
      default:
        hours = 24;
        intervalMinutes = 120;
        dataPoints = 12;
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hours * 60 * 60 * 1000);

    const timeLabels = [];
    const inbound = [];
    const outbound = [];

    for (let i = 0; i < dataPoints; i++) {
      const time = new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000);

      // 生成时间标签
      if (timeRange === '7d') {
        timeLabels.push(time.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' }));
      } else {
        timeLabels.push(time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      }

      // 计算该时间段的消息数量
      const periodStart = time;
      const periodEnd = new Date(time.getTime() + intervalMinutes * 60 * 1000);

      let inboundCount = 0;
      let outboundCount = 0;

      // 遍历统计数据，累计该时间段内的消息数量
      for (const [timeKey, count] of this.messageStats.inbound.entries()) {
        const keyTime = new Date(timeKey);
        if (keyTime >= periodStart && keyTime < periodEnd) {
          inboundCount += count;
        }
      }

      for (const [timeKey, count] of this.messageStats.outbound.entries()) {
        const keyTime = new Date(timeKey);
        if (keyTime >= periodStart && keyTime < periodEnd) {
          outboundCount += count;
        }
      }

      inbound.push(inboundCount);
      outbound.push(outboundCount);
    }

    return {
      timeLabels,
      inbound,
      outbound,
      totalInbound: this.messageStats.totalInbound,
      totalOutbound: this.messageStats.totalOutbound
    };
  }

  /**
   * 清理过期的统计数据
   */
  cleanupStats() {
    const now = new Date();
    const cutoffTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000); // 保留7天数据

    // 清理inbound统计
    for (const [timeKey] of this.messageStats.inbound.entries()) {
      const keyTime = new Date(timeKey);
      if (keyTime < cutoffTime) {
        this.messageStats.inbound.delete(timeKey);
      }
    }

    // 清理outbound统计
    for (const [timeKey] of this.messageStats.outbound.entries()) {
      const keyTime = new Date(timeKey);
      if (keyTime < cutoffTime) {
        this.messageStats.outbound.delete(timeKey);
      }
    }

    logger.debug('清理过期统计数据完成', {
      inboundKeys: this.messageStats.inbound.size,
      outboundKeys: this.messageStats.outbound.size
    });
  }

  /**
   * 启动统计数据清理定时器
   */
  startStatsCleanup() {
    this.startDeviceLastSeenCleanup();
    this.statsCleanupTimer = setInterval(() => {
      this.cleanupStats();
    }, this.statsCleanupInterval);
  }

  /**
   * 停止统计数据清理定时器
   */
  stopStatsCleanup() {
    if (this.statsCleanupTimer) {
      clearInterval(this.statsCleanupTimer);
      this.statsCleanupTimer = null;
    }
    this.stopDeviceLastSeenCleanup();
  }

  startDeviceLastSeenCleanup() {
    this.deviceLastSeenCleanupTimer = setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      for (const [deviceId, lastSeen] of this.deviceLastSeen) {
        if (now - lastSeen > this.deviceLastSeenMaxAge) {
          this.deviceLastSeen.delete(deviceId);
          cleaned++;
        }
      }
      if (cleaned > 0) {
        logger.debug("deviceLastSeen cleaned " + cleaned + ", remaining " + this.deviceLastSeen.size);
      }
    }, this.deviceLastSeenCleanupInterval);
  }

  stopDeviceLastSeenCleanup() {
    if (this.deviceLastSeenCleanupTimer) {
      clearInterval(this.deviceLastSeenCleanupTimer);
      this.deviceLastSeenCleanupTimer = null;
    }
  }

  /**
   * 发布消息到设备
   */
  /**
   * 通用的MQTT消息发布方法
   * @param {string} topic - MQTT主题
   * @param {string|object} message - 消息内容
   * @param {object} options - 发布选项
   */
  async publish(topic, message, options = { qos: 1 }) {
    return new Promise((resolve, reject) => {
      try {
        if (!this.isConnected) {
          throw new Error('MQTT未连接');
        }

        const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

        this.client.publish(topic, messageStr, options, (err) => {
          if (err) {
            logger.error('发布消息失败', { topic, error: err.message });
            reject(err);
          } else {
            logger.debug('消息发布成功', { topic, message: messageStr });
            // 统计发送消息
            this.recordOutboundMessage();
            resolve();
          }
        });

      } catch (error) {
        logger.error('发布MQTT消息失败', { error: error.message });
        reject(error);
      }
    });
  }

  async publishToDevice(deviceId, message, topic = null) {
    try {
      if (!this.isConnected) {
        throw new Error('MQTT未连接');
      }

      // 如果没有指定主题，使用默认主题格式
      const publishTopic = topic || `zhhl/BNDK/${deviceId}/subscribe`;

      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);

      this.client.publish(publishTopic, messageStr, { qos: 1 }, (err) => {
        if (err) {
          logger.error('发布消息失败', { topic: publishTopic, error: err.message });
        } else {
          logger.debug('消息发布成功', { topic: publishTopic, message: messageStr });
          // 统计发送消息
          this.recordOutboundMessage();
        }
      });

    } catch (error) {
      logger.error('发布MQTT消息失败', { error: error.message });
      throw error;
    }
  }

  /**
   * 清理数据中的无效Unicode字符，防止数据库存储错误
   */
  sanitizeDataForStorage(data) {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      // 检查是否为RTU数据（十六进制字符串或包含控制字符）
      if (/^[0-9A-Fa-f\s]+$/.test(data.trim())) {
        return data; // 纯十六进制字符串保持原样
      }
      
      // 检查是否包含控制字符（RTU原始数据）
      if (data.match(/[\x00-\x1F\x7F-\xFF]/)) {
        // RTU原始数据：转换为安全的十六进制表示
        try {
          const bytes = [];
          for (let i = 0; i < data.length; i++) {
            bytes.push(data.charCodeAt(i) & 0xFF);
          }
          const buffer = Buffer.from(bytes);
          return buffer.toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim();
        } catch (error) {
          // 如果转换失败，返回安全的字符串表示
          return '[RTU_DATA_CONVERSION_ERROR]';
        }
      }
      
      // 检查是否包含Unicode转义序列
      if (/\\u[0-9A-Fa-f]{4}/.test(data)) {
        // 包含Unicode转义序列，需要特殊处理
        try {
          // 将Unicode转义序列转换为实际字符，然后转为十六进制
          const unescaped = data.replace(/\\u([0-9A-Fa-f]{4})/g, (match, hex) => {
            return String.fromCharCode(parseInt(hex, 16));
          });
          const bytes = [];
          for (let i = 0; i < unescaped.length; i++) {
            bytes.push(unescaped.charCodeAt(i) & 0xFF);
          }
          const buffer = Buffer.from(bytes);
          return buffer.toString('hex').toUpperCase().replace(/(..)/g, '$1 ').trim();
        } catch (error) {
          return '[RTU_UNICODE_CONVERSION_ERROR]';
        }
      }
      
      // 普通字符串：移除或替换无效字符
      return data
        .replace(/\\u(?![0-9a-fA-F]{4})/g, '\\\\u') // 转义无效的\u序列
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除控制字符
        .replace(/\uFFFE|\uFFFF/g, ''); // 移除非字符码点
    }

    if (Array.isArray(data)) {
      return data.map(item => this.sanitizeDataForStorage(item));
    }

    if (typeof data === 'object') {
      const sanitized = {};
      for (const [key, value] of Object.entries(data)) {
        sanitized[this.sanitizeDataForStorage(key)] = this.sanitizeDataForStorage(value);
      }
      return sanitized;
    }

    return data;
  }

  /**
   * 清理过期的设备缓存
   */
  cleanupDeviceCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [deviceKey, cacheData] of this.deviceCache.entries()) {
      if (now - cacheData.timestamp > this.cacheExpiry) {
        this.deviceCache.delete(deviceKey);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('清理过期设备缓存', {
        cleanedCount,
        remainingCount: this.deviceCache.size
      });
    }
  }

  /**
   * 启动设备缓存清理定时器
   */
  startCacheCleanup() {
    this.cacheCleanupTimer = setInterval(() => {
      this.cleanupDeviceCache();
    }, 2 * 60 * 1000); // 每5分钟清理一次
  }

  /**
   * 停止设备缓存清理定时器
   */
  stopCacheCleanup() {
    if (this.cacheCleanupTimer) {
      clearInterval(this.cacheCleanupTimer);
      this.cacheCleanupTimer = null;
    }
  }

  /**
   * 根据设备类型解析和存储数据
   */
  async parseAndStoreDeviceData(device, data, topic) {
    try {
      // 优先使用协议配置进行数据解析
      const protocolParsed = await this.parseDeviceDataByProtocolConfig(device, data, topic);

      // 如果协议配置解析成功，则完成数据处理
      if (protocolParsed) {
        return;
      }

      // 如果没有协议配置或协议配置解析失败，记录警告
      logger.warn('设备数据解析失败：未找到有效的协议配置', {
        deviceId: device.id,
        deviceType: device.device_type?.name
      });
      return;



    } catch (error) {
      logger.error('解析和存储设备数据失败', {
        deviceId: device.id,
        error: error.message
      });
    }
  }

  /**
   * 根据协议配置解析设备数据
   */
  async parseDeviceDataByProtocolConfig(device, data, topic) {
    try {
      // 检查设备是否配置了协议
      if (!device.protocol_config_id) {
        logger.debug('设备未配置协议', { deviceId: device.id });
        return false;
      }

      // 获取协议配置
      const { ProtocolConfig } = require('../models');
      const protocolConfig = await ProtocolConfig.findByPk(device.protocol_config_id);

      if (!protocolConfig) {
        logger.warn('协议配置不存在', { deviceId: device.id, protocolConfigId: device.protocol_config_id });
        return false;
      }

      // 检查协议状态
      if (protocolConfig.status !== 'active') {
        logger.debug('协议配置未激活', { deviceId: device.id, protocolConfigId: device.protocol_config_id });
        return false;
      }

      // 声明解析后的数据变量
      let parsedData;

      // 过滤非电表数据（如心跳信息）
      if (typeof data === 'string') {
        // 检查是否为设备心跳或状态信息
        if (this.isDeviceHeartbeatData(data)) {
          logger.debug('检测到设备心跳数据，跳过电表数据解析', { deviceId: device.id, data });
          return false;
        }
        
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          logger.warn('无法解析设备数据JSON', { deviceId: device.id, data });
          return false;
        }
      } else {
        parsedData = data;
      }

      // 根据协议配置的数据解析配置解析字段
      const extractedData = {};
      const dataParsingConfig = protocolConfig.data_parsing_config;

      if (dataParsingConfig?.format === 'mqtt_json_base64_modbus_rtu') {
        const commandAck = parseDa51kdWriteAck(parsedData);
        if (commandAck) {
          logger.debug('DA51KD控制命令已由设备确认', {
            deviceId: device.id,
            ...commandAck
          });
          return true;
        }
        parsedData = { ...parsedData, decoded: parseDa51kdUplink(parsedData) };
      }

      // 检查是否为温控器特殊响应格式（包含items和data数组）
      if (parsedData.body && parsedData.body.items && parsedData.body.data && 
          Array.isArray(parsedData.body.items) && Array.isArray(parsedData.body.data) &&
          parsedData.body.data.length > 0 && Array.isArray(parsedData.body.data[0])) {
        
        logger.debug('检测到温控器特殊响应格式，按items和data数组对应关系解析', {
          deviceId: device.id,
          itemsCount: parsedData.body.items.length,
          dataCount: parsedData.body.data[0].length
        });

        // 按照items和data数组的索引对应关系解析数据
        const items = parsedData.body.items;
        const dataValues = parsedData.body.data[0]; // 取第一行数据

        for (let i = 0; i < items.length && i < dataValues.length; i++) {
          const itemName = items[i];
          const itemValue = dataValues[i];
          
          // 根据协议配置查找对应的字段配置
          if (dataParsingConfig && dataParsingConfig.params_mapping) {
            const fieldConfig = dataParsingConfig.params_mapping[itemName];
            if (fieldConfig) {
              extractedData[itemName] = this.convertFieldValue(itemValue, fieldConfig.type);
            } else {
              // 如果没有找到字段配置，使用默认类型
              extractedData[itemName] = itemValue;
            }
          } else if (dataParsingConfig && dataParsingConfig.fields && Array.isArray(dataParsingConfig.fields)) {
            const fieldConfig = dataParsingConfig.fields.find(field => field.name === itemName);
            if (fieldConfig) {
              extractedData[itemName] = this.convertFieldValue(itemValue, fieldConfig.type);
            } else {
              // 如果没有找到字段配置，使用默认类型
              extractedData[itemName] = itemValue;
            }
          } else {
            extractedData[itemName] = itemValue;
          }
        }
      } else if (dataParsingConfig && dataParsingConfig.params_mapping) {
        // 处理params_mapping格式的协议配置（如温控器）
        for (const [paramName, paramConfig] of Object.entries(dataParsingConfig.params_mapping)) {
          const fieldPath = paramConfig.field || paramName; // 支持字段映射
          
          // 根据路径获取值（支持嵌套路径如 "body.runOn"）
          const rawValue = this.getValueByPath(parsedData, fieldPath);
          
          if (rawValue !== undefined && rawValue !== null) {
            extractedData[paramName] = this.convertFieldValue(rawValue, paramConfig.type);
          }
        }
      } else if (dataParsingConfig && dataParsingConfig.fields && Array.isArray(dataParsingConfig.fields)) {
        // 原有的路径解析逻辑
        for (const field of dataParsingConfig.fields) {
          const fieldName = field.name;
          const fieldType = field.type;
          const fieldPath = field.path || fieldName; // 支持路径映射

          // 根据路径获取值（支持嵌套路径如 "data.temperature"）
          const rawValue = this.getValueByPath(parsedData, fieldPath);

          if (rawValue !== undefined && rawValue !== null) {
            extractedData[fieldName] = this.convertFieldValue(rawValue, fieldType);
          }
        }
      }

      // 验证数据
      const validationResult = this.validateDataByProtocolConfig(extractedData, protocolConfig.validation_rules);
      if (!validationResult.isValid) {
        logger.warn('数据验证失败', {
          deviceId: device.id,
          protocolConfigId: device.protocol_config_id,
          errors: validationResult.errors
        });
        // 可以选择是否继续处理或直接返回
      }

      // 如果有提取到的数据，保存到对应的数据表
      if (Object.keys(extractedData).length > 0) {
        const saved = await this.saveDeviceDataByProtocolConfig(device, extractedData, protocolConfig, topic);

        if (saved === false) {
          return true;
        }

        logger.debug('设备数据已根据协议配置解析和存储', {
          deviceId: device.id,
          protocolName: protocolConfig.name,
          protocolVersion: protocolConfig.version,
          extractedFields: Object.keys(extractedData)
        });

        return true;
      }

      return false;

    } catch (error) {
      logger.error('根据协议配置解析设备数据失败', {
        deviceId: device.id,
        error: error.message
      });
      return false;
    }
  }

  /**
   * 检查是否为设备心跳数据
   */
  isDeviceHeartbeatData(data) {
    if (typeof data !== 'string') {
      return false;
    }
    
    // 常见的设备心跳或状态信息模式
    const heartbeatPatterns = [
      /^www\.usr\.cn$/i,           // USR设备心跳
      /^heartbeat$/i,              // 心跳信息
      /^ping$/i,                   // ping信息
      /^online$/i,                 // 在线状态
      /^status$/i,                 // 状态信息
      /^alive$/i,                  // 存活信息
      /^ok$/i,                     // 确认信息
      /^ready$/i                   // 就绪信息
    ];
    
    return heartbeatPatterns.some(pattern => pattern.test(data.trim()));
  }

  /**
   * 根据路径获取对象中的值（支持嵌套路径）
   */
  getValueByPath(obj, path) {
    if (!path || typeof path !== 'string') {
      return undefined;
    }

    const keys = path.split('.');
    let current = obj;

    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }

    return current;
  }

  /**
   * 根据协议配置的验证规则验证数据
   */
  validateDataByProtocolConfig(data, validationRules) {
    const result = {
      isValid: true,
      errors: []
    };

    if (!validationRules || !Array.isArray(validationRules)) {
      return result;
    }

    for (const rule of validationRules) {
      const { field, type, required, min, max, pattern } = rule;
      const value = data[field];

      // 检查必填字段
      if (required && (value === undefined || value === null || value === '')) {
        result.isValid = false;
        result.errors.push(`字段 ${field} 是必填的`);
        continue;
      }

      // 如果值为空且不是必填，跳过其他验证
      if (value === undefined || value === null || value === '') {
        continue;
      }

      // 类型验证
      if (type) {
        let typeValid = true;
        switch (type) {
          case 'number':
            typeValid = typeof value === 'number' && !isNaN(value);
            break;
          case 'boolean':
            typeValid = typeof value === 'boolean';
            break;
          case 'string':
            typeValid = typeof value === 'string';
            break;
        }

        if (!typeValid) {
          result.isValid = false;
          result.errors.push(`字段 ${field} 类型不正确，期望 ${type}`);
          continue;
        }
      }

      // 数值范围验证
      if (typeof value === 'number') {
        if (min !== undefined && value < min) {
          result.isValid = false;
          result.errors.push(`字段 ${field} 值 ${value} 小于最小值 ${min}`);
        }
        if (max !== undefined && value > max) {
          result.isValid = false;
          result.errors.push(`字段 ${field} 值 ${value} 大于最大值 ${max}`);
        }
      }

      // 正则表达式验证
      if (pattern && typeof value === 'string') {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          result.isValid = false;
          result.errors.push(`字段 ${field} 格式不正确`);
        }
      }
    }

    return result;
  }

  /**
   * 根据协议配置保存设备数据
   */
  async saveDeviceDataByProtocolConfig(device, extractedData, protocolConfig, topic) {
    try {
      const protocolDeviceType = String(protocolConfig.device_type || '').trim().toLowerCase();
      const isAirConditionerProtocol = [
        '分散空调控制器',
        'air_conditioner',
        'air-conditioner'
      ].includes(protocolDeviceType);
      const isSwitchProtocol = (
        device.is_switch === true && device.is_lighting !== true
      ) || [
        '定时开关',
        'switch',
        'switch_control',
        'switch-control'
      ].includes(protocolDeviceType);

      if (isAirConditionerProtocol) {
        await this.saveAirConditionerDataByProtocol(device, extractedData, protocolConfig, topic);
      } else if (isSwitchProtocol) {
        const manufacturerCode = this.extractManufacturerFromTopic(topic) ||
          device.manufacturer_code || protocolConfig.manufacturer_code;
        const powerStatus = this.extractBooleanValue(
          extractedData.power_status ?? extractedData.power_state ?? extractedData.switch_status
        );
        if (powerStatus !== null) {
          await telemetryStore.saveStatus({
            device: { ...device, manufacturer_code: manufacturerCode },
            moduleType: 'switch',
            state: { power_status: powerStatus },
            source: 'mqtt',
            rawPayload: extractedData
          });
        }
        const electricalData = this.prepareElectricalDataByProtocol(extractedData);
        if (SWITCH_ELECTRICAL_FIELDS.some(
          key => electricalData[key] !== null && electricalData[key] !== undefined
        )) {
          await telemetryStore.saveElectrical({
            device: { ...device, manufacturer_code: manufacturerCode },
            moduleType: 'switch',
            data: electricalData,
            measuredAt: new Date()
          });
        }
      // 检查是否为照明设备协议
      } else if (protocolConfig.name === '智鸟照明开关' ||
        protocolConfig.device_type === 'lighting_switch' ||
        this.isLightingDataByProtocol(extractedData)) {

        // 保存照明设备数据
        const manufacturerCode = this.extractManufacturerFromTopic(topic) || device.manufacturer_code || 'BNDK';

        await this.saveLightingDataByProtocol(device, extractedData, topic);

        // 保存开关状态数据
        const switchData = this.prepareSwitchStatusDataByProtocol(extractedData);
        if (Object.keys(switchData).filter(key => switchData[key] !== null).length > 0) {
          await this.saveLightingSwitchDataToTable(device, switchData, manufacturerCode);
        }

        // 保存电气数据
        const electricalData = this.prepareElectricalDataByProtocol(extractedData);
        if (SWITCH_ELECTRICAL_FIELDS.some(key => electricalData[key] !== null && electricalData[key] !== undefined)) {
          await this.saveLightingElectricalDataToTable(device, electricalData, manufacturerCode);
        }
      } else if (this.isThermostatDevice(device, extractedData)) {
        // 保存温控器设备数据
        await this.saveThermostatDeviceData(device, extractedData);
      } else {
        // 对于其他类型的设备，保存到通用设备数据表
        await this.saveGenericDeviceData(device, extractedData);
      }

      return true;

    } catch (error) {
      if (isInactiveControlModuleError(error)) {
        logger.debug('设备未加入对应控制模块，跳过分类时序数据', {
          deviceId: device.id,
          protocolConfigId: protocolConfig.id
        });
        return false;
      }

      logger.error('根据协议配置保存设备数据失败', {
        deviceId: device.id,
        protocolConfigId: protocolConfig.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 检查是否为照明设备数据（基于协议配置）
   */
  isLightingDataByProtocol(data) {
    // 检查是否包含照明设备的特征字段
    const lightingFields = ['key1', 'key2', 'key3', 'voltage', 'current', 'power', 'energy'];
    return lightingFields.some(field => data.hasOwnProperty(field));
  }

  /**
   * 检查是否为温控器设备
   */
  isThermostatDevice(device, data) {
    // 检查设备类型
    if (device.device_type && device.device_type.name === '空调温控器') {
      return true;
    }
    
    // 检查是否包含温控器的特征字段（基于协议配置）
    const thermostatFields = ['runOn', 'setOn', 'roomTemp', 'setTemp', 'runTemp', 'runMode', 'setMode', 'runFanSpeed', 'setFanSpeed'];
    return thermostatFields.some(field => data.hasOwnProperty(field));
  }

  /**
   * 保存温控器设备数据
   */
  async saveThermostatDeviceData(device, data) {
    try {
      // 准备数据字段
      const fields = {
        current_temperature: null,
        target_temp: null,
        power_status: null,
        ac_mode: null,
        humidity: null
      };

      // 准备风速数据（不存储到数据库，通过WebSocket实时推送）
      let fanSpeed = null;

      // 处理房间温度（当前温度）
      if (data.roomTemp !== undefined) {
        fields.current_temperature = this.extractNumericValue(data.roomTemp) / 10; // 协议中单位是0.1℃
      }

      // 处理设定温度
      if (data.setTemp !== undefined) {
        fields.target_temp = this.extractNumericValue(data.setTemp) / 10; // 协议中单位是0.1℃
      }

      // 处理运行温度（优先级高于设定温度）
      if (data.runTemp !== undefined) {
        fields.target_temp = this.extractNumericValue(data.runTemp) / 10; // 协议中单位是0.1℃
      }

      // 处理设备开关状态 - runOn用于反映当前状态，setOn用于设置命令
      // 根据用户要求调整映射策略：
      // runOn = 16 -> 视为 0 (关机状态)
      // runOn = 17 -> 视为 1 (运行状态)
      // 其他值保持原有逻辑: 0 -> 关机, 1 -> 运行
      if (data.runOn !== undefined) {
        const runOnValue = this.extractNumericValue(data.runOn);
        
        // 新的映射策略：16->0, 17->1
        let mappedValue;
        if (runOnValue === 16) {
          mappedValue = 0; // 16视为0（关机）
        } else if (runOnValue === 17) {
          mappedValue = 1; // 17视为1（运行）
        } else {
          mappedValue = runOnValue; // 其他值保持不变
        }
        
        fields.power_status = (mappedValue === 1);
        logger.debug('使用runOn字段设置电源状态（当前运行状态）', {
          deviceId: device.id,
          原始runOnValue: runOnValue,
          映射后值: mappedValue,
          powerStatus: fields.power_status,
          状态解释: (mappedValue === 1) ? '运行' : '关机'
        });
      } else if (data.setOn !== undefined) {
        // setOn字段：0=关机，1=开机（设置命令字段，仅在没有runOn时用于状态参考）
        const setOnValue = this.extractNumericValue(data.setOn);
        fields.power_status = setOnValue === 1;
        logger.debug('使用setOn字段设置电源状态（设置命令）', {
          deviceId: device.id,
          setOnValue: setOnValue,
          powerStatus: fields.power_status
        });
      }

      // 处理运行模式 - runMode用于反映当前模式，setMode用于设置命令
      // runMode是当前实际运行模式，setMode是设置模式命令
      if (data.runMode !== undefined) {
        const modeValue = this.extractNumericValue(data.runMode);
        switch (modeValue) {
          case 0: fields.ac_mode = 'fan'; break;        // 送风模式
          case 1: fields.ac_mode = 'heat'; break;       // 制热模式
          case 2: fields.ac_mode = 'cool'; break;       // 制冷模式
          case 3: fields.ac_mode = 'dehumidify'; break; // 除湿模式
          default: fields.ac_mode = 'cool';             // 默认制冷模式
        }
      } else if (data.setMode !== undefined) {
        // setMode字段：设置模式命令，仅在没有runMode时用于状态参考
        const modeValue = this.extractNumericValue(data.setMode);
        switch (modeValue) {
          case 0: fields.ac_mode = 'fan'; break;        // 送风模式
          case 1: fields.ac_mode = 'heat'; break;       // 制热模式
          case 2: fields.ac_mode = 'cool'; break;       // 制冷模式
          case 3: fields.ac_mode = 'dehumidify'; break; // 除湿模式
          default: fields.ac_mode = 'cool';             // 默认制冷模式
        }
      }

      // 处理湿度
      if (data.humidity !== undefined) {
        fields.humidity = this.extractNumericValue(data.humidity);
      }

      // 处理风速数据 - runFanSpeed用于反映当前风速，setFanSpeed用于设置命令
      // runFanSpeed是当前实际风速，setFanSpeed是设置风速命令
      if (data.runFanSpeed !== undefined) {
        fanSpeed = this.extractNumericValue(data.runFanSpeed);
      } else if (data.setFanSpeed !== undefined) {
        // setFanSpeed字段：设置风速命令，仅在没有runFanSpeed时用于状态参考
        fanSpeed = this.extractNumericValue(data.setFanSpeed);
      }

      // 构建UPSERT查询，只更新非null的字段
      const updateParts = [];
      const values = [device.id];
      let paramIndex = 2;

      // 过滤非法的目标温度 (数据库约束为 16 到 30)
      if (fields.target_temp !== null && (fields.target_temp < 16 || fields.target_temp > 30)) {
        logger.warn('拦截到非法目标温度数据，忽略该字段更新', {
          deviceId: device.id,
          target_temp: fields.target_temp
        });
        fields.target_temp = null;
      }

      Object.keys(fields).forEach(key => {
        if (fields[key] !== null) {
          updateParts.push(`${key} = $${paramIndex++}`);
          values.push(fields[key]);
        }
      });

      if (updateParts.length > 0) {
        // 使用UPSERT（INSERT ... ON CONFLICT ... DO UPDATE）
        const upsertQuery = `
          INSERT INTO thermostat_properties (device_id, ${Object.keys(fields).filter(k => fields[k] !== null).join(', ')}, last_data_time, created_at, updated_at)
          VALUES ($1, ${Object.keys(fields).filter(k => fields[k] !== null).map((_, i) => `$${i + 2}`).join(', ')}, NOW(), NOW(), NOW())
          ON CONFLICT (device_id) 
          DO UPDATE SET 
            ${updateParts.join(', ')},
            last_data_time = NOW(),
            updated_at = NOW()
        `;
        
        await pool.query(upsertQuery, values);

        await telemetryStore.saveStatus({
          device,
          moduleType: 'thermostat',
          state: {
            ...fields,
            fan_speed: fanSpeed
          },
          source: 'mqtt',
          rawPayload: data
        });

        logger.debug('温控器设备数据已保存', {
          deviceId: device.id,
          updatedFields: Object.keys(fields).filter(k => fields[k] !== null),
          dataFields: Object.keys(data)
        });

        // 更新设备状态缓存
        const thermostatService = require('./thermostatService');
        if (fanSpeed !== null) {
          thermostatService.updateDeviceStatusCache(device.id, { fanSpeed });
        }
        
        // 通过WebSocket推送设备数据更新
        if (websocketService && websocketService.broadcastToTenant) {
          const pushData = { ...data };
          // 添加处理后的风速数据
          if (fanSpeed !== null) {
            pushData.fanSpeed = fanSpeed;
          }
          
          websocketService.broadcastToTenant(device.tenant_id, 'device_data', {
            deviceId: device.id,
            device_id: device.id, // 添加device_id字段以兼容前端
            deviceType: 'thermostat',
            data: pushData,
            timestamp: new Date().toISOString()
          });
        }
      } else {
        logger.debug('温控器设备数据无有效字段需要更新', {
          deviceId: device.id,
          dataFields: Object.keys(data)
        });
      }

    } catch (error) {
      if (isInactiveControlModuleError(error)) {
        logger.debug('温控器设备未加入控制模块，跳过分类时序数据', {
          deviceId: device.id
        });
        return false;
      }

      logger.error('保存温控器设备数据失败', {
        deviceId: device.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 根据协议配置保存照明设备数据
   */
  async saveLightingDataByProtocol(device, data, topic) {
    try {
      const manufacturerCode = this.extractManufacturerFromTopic(topic);

      const lightingData = {
        device_id: device.id,
        manufacturer_code: manufacturerCode,
        key1: this.extractBooleanValue(data.key1),
        key2: this.extractBooleanValue(data.key2),
        key3: this.extractBooleanValue(data.key3),
        voltage: this.extractNumericValue(data.voltage),
        current: this.extractNumericValue(data.current),
        power: this.extractNumericValue(data.power),
        energy: this.extractNumericValue(data.energy),
        timestamp: new Date()
      };

      await db.query(
        `INSERT INTO lighting_data_bndk 
         (device_id, manufacturer_code, key1, key2, key3, voltage, current, power, energy, timestamp) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          lightingData.device_id,
          lightingData.manufacturer_code,
          lightingData.key1,
          lightingData.key2,
          lightingData.key3,
          lightingData.voltage,
          lightingData.current,
          lightingData.power,
          lightingData.energy,
          lightingData.timestamp
        ]
      );

      logger.debug('照明设备数据已保存（协议配置）', {
        deviceId: device.id,
        manufacturerCode
      });

    } catch (error) {
      logger.error('保存照明设备数据失败（协议配置）', {
        deviceId: device.id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 根据协议配置准备开关状态数据
   */
  prepareSwitchStatusDataByProtocol(data) {
    return {
      power_status: this.extractBooleanValue(
        data.power_status ?? data.power_state ?? data.switch_status
      ),
      key1: this.extractBooleanValue(data.key1),
      key2: this.extractBooleanValue(data.key2),
      key3: this.extractBooleanValue(data.key3),
      voltage: null,
      current: null,
      power: null,
      energy: null
    };
  }

  /**
   * 根据协议配置准备电气数据
   */
  prepareElectricalDataByProtocol(data) {
    return {
      key1: null,
      key2: null,
      key3: null,
      voltage: this.extractNumericValue(data.voltage),
      current: this.extractNumericValue(data.current),
      power: this.extractNumericValue(data.power),
      energy: this.extractNumericValue(data.energy),
      voltage_a: this.extractFirstNumericValue(data, ['voltage_a', 'phase_a_voltage', 'phaseAVoltage', 'currentUa', 'ua', 'Ua', 'uA']),
      voltage_b: this.extractFirstNumericValue(data, ['voltage_b', 'phase_b_voltage', 'phaseBVoltage', 'currentUb', 'ub', 'Ub', 'uB']),
      voltage_c: this.extractFirstNumericValue(data, ['voltage_c', 'phase_c_voltage', 'phaseCVoltage', 'currentUc', 'uc', 'Uc', 'uC']),
      current_a: this.extractFirstNumericValue(data, ['current_a', 'phase_a_current', 'phaseACurrent', 'currentIa', 'ia', 'Ia', 'iA']),
      current_b: this.extractFirstNumericValue(data, ['current_b', 'phase_b_current', 'phaseBCurrent', 'currentIb', 'ib', 'Ib', 'iB']),
      current_c: this.extractFirstNumericValue(data, ['current_c', 'phase_c_current', 'phaseCCurrent', 'currentIc', 'ic', 'Ic', 'iC']),
      power_a: this.extractFirstNumericValue(data, ['power_a', 'phase_a_power', 'phaseAPower', 'pa', 'Pa', 'pA']),
      power_b: this.extractFirstNumericValue(data, ['power_b', 'phase_b_power', 'phaseBPower', 'pb', 'Pb', 'pB']),
      power_c: this.extractFirstNumericValue(data, ['power_c', 'phase_c_power', 'phaseCPower', 'pc', 'Pc', 'pC']),
      power_factor: this.extractFirstNumericValue(data, ['power_factor', 'powerFactor', 'pf']),
      power_factor_a: this.extractFirstNumericValue(data, ['power_factor_a', 'phase_a_power_factor', 'phaseAPowerFactor', 'pfa']),
      power_factor_b: this.extractFirstNumericValue(data, ['power_factor_b', 'phase_b_power_factor', 'phaseBPowerFactor', 'pfb']),
      power_factor_c: this.extractFirstNumericValue(data, ['power_factor_c', 'phase_c_power_factor', 'phaseCPowerFactor', 'pfc']),
      frequency: this.extractFirstNumericValue(data, ['frequency', 'freq', 'hz']),
      leakage_current: this.extractFirstNumericValue(data, ['leakage_current', 'leakageCurrent', 'leakage', 'residual_current']),
      temperature: this.extractFirstNumericValue(data, ['temperature', 'temp']),
      temperature_a: this.extractFirstNumericValue(data, ['temperature_a', 'phase_a_temperature', 'line_temperature_a', 'ltA', 'tempA', 'temperatureA', 'tA']),
      temperature_b: this.extractFirstNumericValue(data, ['temperature_b', 'phase_b_temperature', 'line_temperature_b', 'ltB', 'tempB', 'temperatureB', 'tB']),
      temperature_c: this.extractFirstNumericValue(data, ['temperature_c', 'phase_c_temperature', 'line_temperature_c', 'ltC', 'tempC', 'temperatureC', 'tC']),
      raw_payload: data
    };
  }

  async saveAirConditionerDataByProtocol(device, data, protocolConfig, topic) {
    const modeNames = { 1: 'auto', 2: 'cool', 3: 'heat', 4: 'fan', 5: 'dehumidify' };
    const fanNames = { 0: 'auto', 1: 'low', 2: 'medium', 3: 'high' };
    const statusData = {
      power_status: data.power_state ?? null,
      mode: modeNames[Number(data.mode)] ?? data.mode ?? null,
      fan_speed: fanNames[Number(data.fan_speed)] ?? data.fan_speed ?? null,
      target_temperature: data.target_temperature ?? null,
      current_temperature: data.current_temperature ?? null,
      humidity: data.humidity ?? null,
      compressor_state: data.compressor_state ?? null,
      indoor_fan_state: data.indoor_fan_state ?? null,
      outdoor_fan_state: data.outdoor_fan_state ?? null,
      vertical_swing: data.vertical_swing ?? null,
      horizontal_swing: data.horizontal_swing ?? null,
      signal_strength: data.signal_strength ?? null,
      error_code: data.error_code ?? null,
      alarm_code: data.alarm_code ?? null
    };
    const rawPayload = {
      source: 'mqtt',
      topic,
      protocol: protocolConfig.name,
      decoded: data
    };
    const telemetryDevice = {
      ...device,
      manufacturer_code: protocolConfig.manufacturer_code || device.manufacturer_code
    };
    await telemetryStore.saveStatus({
      device: telemetryDevice,
      moduleType: 'air_conditioner',
      state: statusData,
      source: 'mqtt',
      rawPayload
    });

    const electricalData = {
      ...this.prepareElectricalDataByProtocol(data),
      compressor_current: this.extractFirstNumericValue(data, ['compressor_current', 'compressorCurrent']),
      compressor_power: this.extractFirstNumericValue(data, ['compressor_power', 'compressorPower']),
      compressor_temperature: this.extractFirstNumericValue(data, ['compressor_temperature', 'compressorTemperature']),
      indoor_fan_current: this.extractFirstNumericValue(data, ['indoor_fan_current', 'indoorFanCurrent']),
      indoor_fan_power: this.extractFirstNumericValue(data, ['indoor_fan_power', 'indoorFanPower']),
      outdoor_fan_current: this.extractFirstNumericValue(data, ['outdoor_fan_current', 'outdoorFanCurrent']),
      outdoor_fan_power: this.extractFirstNumericValue(data, ['outdoor_fan_power', 'outdoorFanPower']),
      heating_energy: this.extractFirstNumericValue(data, ['heating_energy', 'heatingEnergy']),
      cooling_energy: this.extractFirstNumericValue(data, ['cooling_energy', 'coolingEnergy']),
      standby_power: this.extractFirstNumericValue(data, ['standby_power', 'standbyPower']),
      evaporator_temperature: this.extractFirstNumericValue(data, ['evaporator_temperature', 'evaporatorTemperature']),
      condenser_temperature: this.extractFirstNumericValue(data, ['condenser_temperature', 'condenserTemperature']),
      suction_pressure: this.extractFirstNumericValue(data, ['suction_pressure', 'suctionPressure']),
      discharge_pressure: this.extractFirstNumericValue(data, ['discharge_pressure', 'dischargePressure']),
      extra_metrics: {
        total_powered_duration: data.total_powered_duration ?? null,
        total_running_duration: data.total_running_duration ?? null,
        daily_running_duration: data.daily_running_duration ?? null,
        device_timestamp: data.device_timestamp ?? null,
        signal_strength: data.signal_strength ?? null,
        control_method: data.control_method ?? null
      },
      raw_payload: rawPayload
    };
    const electricalValues = Object.entries(electricalData).filter(
      ([key, value]) => !['raw_payload', 'extra_metrics', 'key1', 'key2', 'key3'].includes(key) && value !== null && value !== undefined
    );
    const hasExtraMetrics = Object.values(electricalData.extra_metrics).some(
      (value) => value !== null && value !== undefined
    );
    if (electricalValues.length > 0 || hasExtraMetrics) {
      await telemetryStore.saveElectrical({
        device: telemetryDevice,
        moduleType: 'air_conditioner',
        data: electricalData,
        phaseType: this.detectSwitchPhaseType(device, electricalData)
      });
    }

    websocketService.broadcastToClients('air_conditioner_status', {
      device_id: device.id,
      imei: device.imei,
      ...statusData,
      electrical_data: electricalData,
      timestamp: new Date().toISOString()
    });
    logger.debug('分散空调上报数据已解析并保存', {
      deviceId: device.id,
      imei: device.imei,
      currentTemperature: statusData.current_temperature,
      targetTemperature: statusData.target_temperature
    });
  }

  /**
   * 保存通用设备数据
   */
  async saveGenericDeviceData(device, data) {
    logger.debug('通用设备数据表已停用，未识别数据仅实时转发', {
      deviceId: device.id,
      dataFields: Object.keys(data || {})
    });
  }

  /**
   * 转换字段值为指定类型
   */
  convertFieldValue(value, type) {
    switch (type) {
      case 'boolean':
        return this.extractBooleanValue(value);
      case 'number':
      case 'float':
      case 'integer':
        return this.extractNumericValue(value);
      case 'string':
        return value ? String(value) : null;
      default:
        return value;
    }
  }



  /**
   * 处理照明开关状态消息
   */
  async handleLightingSwitchStatus(deviceId, data, topic, messageId) {
    try {
      // 查找设备（使用缓存）
      const device = await this.getDeviceWithCache(deviceId, true);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      } else if (messageId && !this.messageProcessingService) {
        logger.warn('消息处理服务未初始化，跳过记录存储开始状态', { messageId, deviceId });
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 从主题中提取厂商编号
      const manufacturerCode = this.extractManufacturerFromTopic(topic);
      if (!manufacturerCode) {
        logger.warn('无法从主题中提取厂商编号', { topic });
        return;
      }

      // 准备开关状态数据（只包含开关状态，电气数据设为null）
      const switchData = this.prepareSwitchStatusData(device, data);
      if (!switchData) {
        logger.warn('无法解析开关状态数据', { deviceId: device.id, data });
        return;
      }

      // 将开关状态数据存储到照明开关状态表中
      await this.saveLightingSwitchDataToTable(device, switchData, manufacturerCode);

      // 清理开关状态数据中的无效Unicode字符
      const cleanedSwitchData = this.sanitizeDataForStorage(data);

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到照明开关状态数据',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: cleanedSwitchData,
          dataSize: JSON.stringify(cleanedSwitchData).length,
          timestamp: new Date().toISOString(),
          messageType: 'switch_status'
        }
      });

      // 通过WebSocket推送给前端
      websocketService.broadcastToClients('lighting_switch_status', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: data,
        switchStates: {
          key1: switchData.key1,
          key2: switchData.key2,
          key3: switchData.key3
        },
        messageType: 'switch_status',
        timestamp: new Date().toISOString()
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      logger.debug('照明开关状态数据处理完成', {
        deviceId: device.id,
        deviceName: device.name,
        switchData: {
          key1: switchData.key1,
          key2: switchData.key2,
          key3: switchData.key3
        }
      });

    } catch (error) {
      logger.error('处理照明开关状态失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 处理照明电气数据消息
   */
  async handleLightingElectricalData(deviceId, data, topic, messageId) {
    try {
      // 查找设备（使用缓存）
      const device = await this.getDeviceWithCache(deviceId, true);

      if (!device) {
        logger.warn('设备不存在', { deviceId });
        return;
      }

      // 记录存储开始状态
      if (messageId) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 从主题中提取厂商编号
      const manufacturerCode = this.extractManufacturerFromTopic(topic);
      if (!manufacturerCode) {
        logger.warn('无法从主题中提取厂商编号', { topic });
        return;
      }

      // 准备电气数据（只包含电气数据，开关状态设为null）
      const electricalData = this.prepareElectricalData(device, data);
      if (!electricalData) {
        logger.warn('无法解析电气数据', { deviceId: device.id, data });
        return;
      }

      // 将电气数据存储到照明电气数据表中
      await this.saveLightingElectricalDataToTable(device, electricalData, manufacturerCode);

      // 清理电气数据中的无效Unicode字符
      const cleanedElectricalData = this.sanitizeDataForStorage(data);

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到照明电气数据',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: cleanedElectricalData,
          dataSize: JSON.stringify(cleanedElectricalData).length,
          timestamp: new Date().toISOString(),
          messageType: 'electrical_data'
        }
      });

      // 通过WebSocket推送给前端
      websocketService.broadcastToClients('lighting_electrical_data', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: data,
        electricalData: {
          voltage: electricalData.voltage,
          current: electricalData.current,
          power: electricalData.power,
          energy: electricalData.energy
        },
        messageType: 'electrical_data',
        timestamp: new Date().toISOString()
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      logger.debug('照明电气数据处理完成', {
        deviceId: device.id,
        deviceName: device.name,
        electricalData: {
          voltage: electricalData.voltage,
          current: electricalData.current,
          power: electricalData.power,
          energy: electricalData.energy
        }
      });

    } catch (error) {
      logger.error('处理照明电气数据失败', {
        deviceId,
        error: error.message
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false);
      }
      throw error;
    }
  }

  /**
   * 处理照明设备数据（保持向后兼容）
   */
  async handleLightingDeviceData(device, data, topic) {
    try {
      // 检查是否为照明开关设备
      if (!this.isLightingDevice(device, data)) {
        return;
      }

      // 从主题中提取厂商编号
      const manufacturerCode = this.extractManufacturerFromTopic(topic);
      if (!manufacturerCode) {
        logger.warn('无法从主题中提取厂商编号', { topic });
        return;
      }

      // 准备照明数据
      const lightingData = this.prepareLightingData(device, data);
      if (!lightingData) {
        logger.warn('无法解析照明设备数据', { deviceId: device.id, data });
        return;
      }

      logger.debug('照明设备数据已保存到统一时序表', {
        deviceId: device.id,
        manufacturerCode,
        device_id: device.device_id,
        imei: device.imei,
        switchData: {
          key1: lightingData.key1,
          key2: lightingData.key2,
          key3: lightingData.key3
        },
        electricalData: {
          voltage: lightingData.voltage,
          current: lightingData.current,
          power: lightingData.power,
          energy: lightingData.energy
        }
      });

    } catch (error) {
      logger.error('处理照明设备数据失败', {
        deviceId: device.id,
        error: error.message
      });
    }
  }

  /**
   * 将照明开关状态数据保存到分离的开关状态表中
   */
  async saveLightingSwitchDataToTable(device, switchData, manufacturerCode) {
    try {
      if (!device.imei) {
        logger.warn('设备缺少IMEI，无法保存照明状态', { deviceId: device.id });
        return;
      }
      const moduleType = device.is_switch && !device.is_lighting ? 'switch' : 'lighting';
      const state = moduleType === 'switch'
        ? {
            power_status: switchData.power_status ?? switchData.power_state ??
              switchData.key1 ?? switchData.key2 ?? switchData.key3
          }
        : {
            switch_1: switchData.key1,
            switch_2: switchData.key2,
            switch_3: switchData.key3,
            key1: switchData.key1,
            key2: switchData.key2,
            key3: switchData.key3
          };
      await telemetryStore.saveStatus({
        device: { ...device, manufacturer_code: manufacturerCode || device.manufacturer_code },
        moduleType,
        state,
        source: 'mqtt',
        rawPayload: switchData.raw_payload || switchData
      });
      logger.debug('设备开关状态已保存到所属模块时序表', {
        deviceId: device.id,
        imei: device.imei,
        manufacturerCode
      });

    } catch (error) {
      logger.error('保存设备开关状态失败', {
        deviceId: device.id,
        imei: device.imei,
        manufacturerCode,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 将照明电气数据保存到分离的电气数据表中
   */
  async saveLightingElectricalDataToTable(device, electricalData, manufacturerCode) {
    try {
      // 检查设备是否有IMEI
      if (!device.imei) {
        const noImeiResult = {
          success: false,
          deviceId: device.id,
          device_id: device.device_id,
          error: '设备缺少IMEI'
        };
        logger.warn('设备缺少IMEI，无法保存到照明电气数据表', noImeiResult);
        return noImeiResult;
      }

      {
        const moduleType = device.is_switch && !device.is_lighting ? 'switch' : 'lighting';
        const resolvedCode = manufacturerCode || device.manufacturer_code || 'BNDK';
        const phaseType = this.detectSwitchPhaseType(device, electricalData);
        const saved = await telemetryStore.saveElectrical({
          device: { ...device, manufacturer_code: resolvedCode },
          moduleType,
          data: electricalData,
          phaseType
        });
        logger.debug('设备电气数据已保存到统一时序表', {
          deviceId: device.id,
          imei: device.imei,
          moduleType,
          phaseType,
          measurementId: saved.id
        });
        return { success: true, id: saved.id, insertMethod: 'timescaledb' };
      }

    } catch (error) {
      logger.error('保存照明电气数据失败', {
        deviceId: device.id,
        imei: device.imei,
        tenantId: device.tenant_id,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * 将照明数据保存到lighting_data_bndk表中（保持向后兼容）
   */
  async saveLightingDataToBndkTable(device, lightingData, manufacturerCode) {
    try {
      // 检查设备是否有IMEI
      if (!device.imei) {
        logger.warn('设备缺少IMEI，无法保存到lighting_data_bndk表', {
          deviceId: device.id,
          device_id: device.device_id
        });
        return;
      }

      // 调用数据库函数insert_lighting_data插入数据
      const query = `
        SELECT insert_lighting_data(
          $1::VARCHAR(20),     -- manufacturer_code
          $2::VARCHAR(100),    -- device_imei
          $3::BOOLEAN,         -- switch_key1
          $4::BOOLEAN,         -- switch_key2
          $5::BOOLEAN,         -- switch_key3
          $6::DECIMAL(10,3),   -- device_voltage
          $7::DECIMAL(10,3),   -- device_current
          $8::DECIMAL(10,3),   -- device_power
          $9::DECIMAL(10,3),   -- device_energy
          $10::TIMESTAMP WITH TIME ZONE  -- data_timestamp
        ) as result;
      `;

      const values = [
        manufacturerCode,
        device.imei,
        lightingData.key1,  // 直接传递布尔值
        lightingData.key2,  // 直接传递布尔值
        lightingData.key3,  // 直接传递布尔值
        lightingData.voltage || 0.000,
        lightingData.current || 0.000,
        lightingData.power || 0.000,
        lightingData.energy || 0.000,
        new Date()
      ];

      const result = await pool.query(query, values);

      if (result.rows[0]?.result) {
        logger.debug('照明数据已成功保存到lighting_data_bndk表', {
          deviceId: device.id,
          imei: device.imei,
          manufacturerCode,
          tableName: `lighting_data_${manufacturerCode.toLowerCase()}`,
          data: lightingData
        });
      } else {
        logger.warn('照明数据保存到lighting_data_bndk表失败', {
          deviceId: device.id,
          imei: device.imei,
          manufacturerCode
        });
      }

    } catch (error) {
      logger.error('保存照明数据到lighting_data_bndk表失败', {
        deviceId: device.id,
        imei: device.imei,
        manufacturerCode,
        resolvedManufacturerCode,
        error: error.message
      });
      throw error;
    }
  }

  async saveSwitchElectricalData(device, electricalData, manufacturerCode) {
    try {
      const hasElectricalValue = SWITCH_ELECTRICAL_FIELDS.some(field => electricalData[field] !== null && electricalData[field] !== undefined);
      if (!hasElectricalValue) return { success: false, skipped: true, reason: 'no_electrical_fields' };

      const phaseType = this.detectSwitchPhaseType(device, electricalData);
      const moduleType = device.is_lighting && !device.is_switch ? 'lighting' : 'switch';
      const result = await telemetryStore.saveElectrical({
        device: { ...device, manufacturer_code: manufacturerCode || device.manufacturer_code },
        moduleType,
        data: electricalData,
        phaseType
      });
      logger.debug('定时开关电气分析数据已保存', {
        id: result.id,
        deviceId: device.id,
        imei: device.imei,
        manufacturerCode,
        phaseType
      });
      return { success: true, id: result.id };
    } catch (error) {
      logger.error('保存定时开关电气分析数据失败', {
        deviceId: device.id,
        imei: device.imei,
        manufacturerCode,
        error: error.message
      });
      return { success: false, error: error.message };
    }
  }

  detectSwitchPhaseType(device, electricalData) {
    const configuredType = device.lighting_type || device.phase_type || device.phaseType;
    if (configuredType === 'triple' || configuredType === 'three_phase') return 'three_phase';
    const hasThreePhaseValue = [
      'voltage_a', 'voltage_b', 'voltage_c',
      'current_a', 'current_b', 'current_c',
      'power_a', 'power_b', 'power_c'
    ].some(field => electricalData[field] !== null && electricalData[field] !== undefined);
    return hasThreePhaseValue ? 'three_phase' : 'single_phase';
  }

  /**
   * 判断是否为照明设备
   */
  isLightingDevice(device, data) {
    // 检查设备类型是否为照明开关
    if (device.device_type && device.device_type.name === '照明开关') {
      return true;
    }

    // 检查数据中是否包含照明设备特征字段
    if (typeof data === 'object' && data !== null) {
      const hasLightingFields = (
        data.hasOwnProperty('key1') ||
        data.hasOwnProperty('key2') ||
        data.hasOwnProperty('key3') ||
        (data.hasOwnProperty('voltage') && data.hasOwnProperty('current') && data.hasOwnProperty('power'))
      );
      return hasLightingFields;
    }

    return false;
  }

  /**
   * 准备开关状态数据（只包含开关状态，电气数据设为null）
   */
  prepareSwitchStatusData(device, data) {
    try {
      // 如果数据是字符串，尝试解析为JSON
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          logger.warn('无法解析开关状态数据JSON', { deviceId: device.id, data });
          return null;
        }
      }

      // 只提取开关状态字段，电气数据设为null
      const switchData = {
        key1: this.extractBooleanValue(parsedData.key1),
        key2: this.extractBooleanValue(parsedData.key2),
        key3: this.extractBooleanValue(parsedData.key3),
        voltage: null,
        current: null,
        power: null,
        energy: null
      };

      return switchData;

    } catch (error) {
      logger.error('准备开关状态数据失败', {
        deviceId: device.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 准备电气数据（只包含电气数据，开关状态设为null）
   */
  prepareElectricalData(device, data) {
    try {
      // 如果数据是字符串，尝试解析为JSON
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          logger.warn('无法解析电气数据JSON', { deviceId: device.id, data });
          return null;
        }
      }

      // 只提取电气数据字段，开关状态设为null
      const electricalData = {
        key1: null,
        key2: null,
        key3: null,
        voltage: this.extractNumericValue(parsedData.voltage),
        current: this.extractNumericValue(parsedData.current),
        power: this.extractNumericValue(parsedData.power),
        energy: this.extractNumericValue(parsedData.energy),
        voltage_a: this.extractFirstNumericValue(parsedData, ['voltage_a', 'phase_a_voltage', 'phaseAVoltage', 'currentUa', 'ua', 'Ua', 'uA']),
        voltage_b: this.extractFirstNumericValue(parsedData, ['voltage_b', 'phase_b_voltage', 'phaseBVoltage', 'currentUb', 'ub', 'Ub', 'uB']),
        voltage_c: this.extractFirstNumericValue(parsedData, ['voltage_c', 'phase_c_voltage', 'phaseCVoltage', 'currentUc', 'uc', 'Uc', 'uC']),
        current_a: this.extractFirstNumericValue(parsedData, ['current_a', 'phase_a_current', 'phaseACurrent', 'currentIa', 'ia', 'Ia', 'iA']),
        current_b: this.extractFirstNumericValue(parsedData, ['current_b', 'phase_b_current', 'phaseBCurrent', 'currentIb', 'ib', 'Ib', 'iB']),
        current_c: this.extractFirstNumericValue(parsedData, ['current_c', 'phase_c_current', 'phaseCCurrent', 'currentIc', 'ic', 'Ic', 'iC']),
        power_a: this.extractFirstNumericValue(parsedData, ['power_a', 'phase_a_power', 'phaseAPower', 'pa', 'Pa', 'pA']),
        power_b: this.extractFirstNumericValue(parsedData, ['power_b', 'phase_b_power', 'phaseBPower', 'pb', 'Pb', 'pB']),
        power_c: this.extractFirstNumericValue(parsedData, ['power_c', 'phase_c_power', 'phaseCPower', 'pc', 'Pc', 'pC']),
        power_factor: this.extractFirstNumericValue(parsedData, ['power_factor', 'powerFactor', 'pf']),
        power_factor_a: this.extractFirstNumericValue(parsedData, ['power_factor_a', 'phase_a_power_factor', 'phaseAPowerFactor', 'pfa']),
        power_factor_b: this.extractFirstNumericValue(parsedData, ['power_factor_b', 'phase_b_power_factor', 'phaseBPowerFactor', 'pfb']),
        power_factor_c: this.extractFirstNumericValue(parsedData, ['power_factor_c', 'phase_c_power_factor', 'phaseCPowerFactor', 'pfc']),
        frequency: this.extractFirstNumericValue(parsedData, ['frequency', 'freq', 'hz']),
        leakage_current: this.extractFirstNumericValue(parsedData, ['leakage_current', 'leakageCurrent', 'leakage', 'residual_current']),
        temperature: this.extractFirstNumericValue(parsedData, ['temperature', 'temp']),
        raw_payload: parsedData
      };

      return electricalData;

    } catch (error) {
      logger.error('准备电气数据失败', {
        deviceId: device.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 准备照明数据（完整数据，保持向后兼容）
   */
  prepareLightingData(device, data) {
    try {
      // 如果数据是字符串，尝试解析为JSON
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          logger.warn('无法解析照明设备数据JSON', { deviceId: device.id, data });
          return null;
        }
      }

      // 提取照明设备字段
      const lightingData = {
        key1: this.extractBooleanValue(parsedData.key1),
        key2: this.extractBooleanValue(parsedData.key2),
        key3: this.extractBooleanValue(parsedData.key3),
        voltage: this.extractNumericValue(parsedData.voltage),
        current: this.extractNumericValue(parsedData.current),
        power: this.extractNumericValue(parsedData.power),
        energy: this.extractNumericValue(parsedData.energy)
      };

      return lightingData;

    } catch (error) {
      logger.error('准备照明数据失败', {
        deviceId: device.id,
        error: error.message
      });
      return null;
    }
  }

  /**
   * 提取布尔值
   */
  extractBooleanValue(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1' || lowerValue === 'on') {
        return true;
      }
      if (lowerValue === 'false' || lowerValue === '0' || lowerValue === 'off') {
        return false;
      }
    }
    if (typeof value === 'number') {
      return value !== 0;
    }
    return null;
  }

  /**
   * 提取数值
   */
  extractNumericValue(value) {
    if (value === null || value === undefined) {
      return null;
    }
    if (typeof value === 'number') {
      return isNaN(value) ? null : value;
    }
    if (typeof value === 'string') {
      const numValue = parseFloat(value);
      return isNaN(numValue) ? null : numValue;
    }
    return null;
  }

  extractFirstNumericValue(data, fieldNames) {
    if (!data || typeof data !== 'object') return null;
    for (const fieldName of fieldNames) {
      const value = this.extractNumericValue(data[fieldName]);
      if (value !== null) return value;
    }
    return null;
  }



  /**
   * 处理多联机状态消息
   */
  async handleMultiUnitAcStatus(deviceId, statusData, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('多联机设备不存在', { deviceId });
        return;
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      // 解析多联机状态数据
      let parsedData = statusData;
      if (typeof statusData === 'string') {
        try {
          parsedData = JSON.parse(statusData);
        } catch (e) {
          logger.warn('无法解析多联机状态数据JSON', { deviceId, statusData });
          parsedData = { raw: statusData };
        }
      }

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到多联机状态数据',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: parsedData,
          messageType: 'multi_unit_ac_status',
          timestamp: new Date().toISOString()
        }
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      // 通过WebSocket推送给前端
      websocketService.broadcastToClients('multi_unit_ac_status', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: parsedData,
        messageType: 'multi_unit_ac_status',
        timestamp: new Date().toISOString()
      });

      logger.debug('多联机状态数据处理完成', {
        deviceId: device.id,
        deviceName: device.name
      });

    } catch (error) {
      logger.error('处理多联机状态数据失败', {
        deviceId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * 处理多联机心跳包
   */
  async handleMultiUnitAcHeartbeat(deviceId, heartbeatData, topic, messageId) {
    logger.debug('开始处理多联机心跳包', { deviceId, messageId, topic });
    
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        const errorMessage = `多联机设备不存在: ${deviceId}`;
        
        // 记录警告日志
        logger.warn(errorMessage, { 
          deviceId, 
          topic, 
          messageId,
          timestamp: new Date().toISOString()
        });
        
        // 通过WebSocket推送设备不存在的警告给前端
        websocketService.broadcastToClients('device_not_found', {
          deviceId: deviceId,
          message: errorMessage,
          topic: topic,
          messageId: messageId,
          messageType: 'multi_unit_ac_heartbeat',
          level: 'warning',
          timestamp: new Date()
        });
        
        // 记录设备日志（如果可能的话，创建一个临时记录）
        try {
          await persistDeviceLog({
            device_id: null, // 设备不存在，所以device_id为null
            level: 'warning',
            message: errorMessage,
            data: {
              direction: 'incoming',
              source: 'mqtt',
              topic: topic,
              deviceId: deviceId,
              messageId: messageId,
              messageType: 'multi_unit_ac_heartbeat',
              error: 'device_not_found',
              timestamp: new Date().toISOString()
            }
          });
        } catch (logError) {
          logger.error('记录设备不存在日志失败', { 
            deviceId, 
            error: logError.message 
          });
        }
        
        logger.warn('多联机心跳包设备不存在', { deviceId, messageId, topic });
        return;
      }

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      } else {
        logger.debug('跳过心跳包存储开始记录', { hasMessageId: !!messageId, hasService: !!this.messageProcessingService });
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 获取多联机主机信息并更新心跳时间
      const { MultiUnitAcHost } = require('../models');
      const hosts = await MultiUnitAcHost.findAll({
        where: { device_id: device.id }
      });

      const currentTime = new Date();
      
      // 更新所有关联主机的心跳时间和状态
      for (const host of hosts) {
        await host.update({
          last_heartbeat: currentTime,
          host_status: 'online',
          status: 'online'
        });
        
        logger.debug('更新多联机主机心跳状态', {
          hostId: host.id,
          hostName: host.host_name,
          deviceId: device.id,
          status: 'online'
        });
      }

      // 记录心跳日志
      try {
        await persistDeviceLog({
          device_id: device.id,
          level: 'info',
          message: '接收到多联机心跳包',
          data: {
            direction: 'incoming',
            source: 'mqtt',
            topic: topic,
            payload: heartbeatData,
            messageType: 'multi_unit_ac_heartbeat',
            timestamp: currentTime.toISOString(),
            hostsUpdated: hosts.length
          }
        });
      } catch (logError) {
        logger.warn('记录多联机心跳日志失败', { deviceId: device.id, error: logError.message });
        // 继续执行，不因为日志创建失败而中断
      }

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      } else {
        logger.debug('跳过心跳包存储完成记录', { hasMessageId: !!messageId, hasService: !!this.messageProcessingService });
      }

      // 通过WebSocket推送给前端
      try {
        websocketService.broadcastToClients('multi_unit_ac_heartbeat', {
          deviceId: device.id,
          device_id: device.id,
          device_name: device.name,
          device_id_value: device.device_id,
          tenant_id: device.tenant_id,
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: heartbeatData,
          messageType: 'multi_unit_ac_heartbeat',
          timestamp: currentTime,
          hostsUpdated: hosts.length
        });
      } catch (wsError) {
        logger.warn('广播多联机心跳失败', { deviceId: device.id, error: wsError.message });
        // 继续执行，不因为WebSocket广播失败而中断
      }

      logger.debug('多联机心跳包处理完成', {
        deviceId: device.id,
        deviceName: device.name,
        hostsUpdated: hosts.length
      });

    } catch (error) {
      logger.error('处理多联机心跳包失败', {
        deviceId,
        error: error.message,
        stack: error.stack
      });

      // 记录存储失败状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId, false, error.message);
      }
      throw error;
    }
  }

  /**
   * 处理多联机控制响应消息
   */
  async handleMultiUnitAcResponse(deviceId, responseData, topic, messageId) {
    try {
      const device = await this.getDeviceWithCache(deviceId);

      if (!device) {
        logger.warn('多联机设备不存在', { deviceId });
        return;
      }

      // 更新设备状态为在线
      await this.updateDeviceStatus(device, 'online');

      // 记录存储开始状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageStarted(messageId);
      }

      // 解析多联机响应数据
      let parsedData = responseData;
      if (typeof responseData === 'string') {
        try {
          parsedData = JSON.parse(responseData);
        } catch (e) {
          logger.warn('无法解析多联机响应数据JSON', { deviceId, responseData });
          parsedData = { raw: responseData };
        }
      }

      // 记录日志
      await persistDeviceLog({
        device_id: device.id,
        level: 'info',
        message: '接收到多联机控制响应',
        data: {
          direction: 'incoming',
          source: 'mqtt',
          topic: topic,
          payload: parsedData,
          messageType: 'multi_unit_ac_response',
          timestamp: new Date().toISOString()
        }
      });

      // 记录存储完成状态
      if (messageId && this.messageProcessingService) {
        await this.messageProcessingService.recordStorageCompleted(messageId);
      }

      // 通过WebSocket推送给前端
      websocketService.broadcastToClients('multi_unit_ac_response', {
        deviceId: device.id,
        device_id: device.id,
        device_name: device.name,
        device_id_value: device.device_id,
        tenant_id: device.tenant_id,
        direction: 'incoming',
        source: 'mqtt',
        topic: topic,
        payload: parsedData,
        messageType: 'multi_unit_ac_response',
        timestamp: new Date().toISOString()
      });

      logger.info('多联机控制响应处理完成', {
        deviceId: device.id,
        deviceName: device.name
      });

    } catch (error) {
      logger.error('处理多联机控制响应失败', {
        deviceId,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * 获取连接状态
   */
  getStatus() {
    return {
      connected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      subscribedTopics: Object.values(this.topicPatterns),
      activeDevices: this.deviceLastSeen.size,
      cachedDevices: this.deviceCache.size,
      messageStats: {
        totalInbound: this.messageStats.totalInbound,
        totalOutbound: this.messageStats.totalOutbound,
        inboundKeys: this.messageStats.inbound.size,
        outboundKeys: this.messageStats.outbound.size
      }
    };
  }
}

module.exports = new MqttService();
