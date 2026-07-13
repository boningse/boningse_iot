const mqtt = require('mqtt');
const EventEmitter = require('events');
const logger = require('./logger');
const db = require('./database');

// MQTT管理器类
class MQTTManager extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // 存储多个MQTT客户端连接
    this.subscriptions = new Map(); // 存储订阅信息
    this.messageHandlers = new Map(); // 存储消息处理器
    this.reconnectAttempts = new Map(); // 重连尝试次数
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 5000; // 5秒
    
    // 绑定事件处理器
    this.setupEventHandlers();
  }

  // 设置事件处理器
  setupEventHandlers() {
    // 监听自定义事件
    this.on('deviceData', this.handleDeviceData.bind(this));
    this.on('deviceStatus', this.handleDeviceStatus.bind(this));
    this.on('deviceCommand', this.handleDeviceCommand.bind(this));
  }

  // 创建MQTT客户端连接
  async createConnection(config) {
    const {
      id,
      name,
      host,
      port,
      username,
      password,
      clientId,
      keepalive = 60,
      clean = true,
      reconnectPeriod = 1000,
      connectTimeout = 30000,
      qos = 1,
      retain = false,
      ssl = false,
      tenantId
    } = config;

    try {
      // 构建连接URL
      const protocol = ssl ? 'mqtts' : 'mqtt';
      const brokerUrl = `${protocol}://${host}:${port}`;

      // MQTT连接选项
      const options = {
        clientId: clientId || `iot_client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        username,
        password,
        keepalive,
        clean,
        reconnectPeriod,
        connectTimeout,
        will: {
          topic: `device/${clientId}/status`,
          payload: JSON.stringify({
            status: 'offline',
            timestamp: new Date().toISOString(),
            clientId
          }),
          qos: 1,
          retain: true
        }
      };

      // 如果是SSL连接，添加SSL选项
      if (ssl) {
        options.rejectUnauthorized = false; // 在生产环境中应该设置为true并提供正确的证书
      }

      logger.mqttEvent('Attempting to connect to MQTT broker', {
        configId: id,
        brokerUrl,
        clientId: options.clientId,
        tenantId
      });

      // 创建MQTT客户端
      const client = mqtt.connect(brokerUrl, options);

      // 设置客户端元数据
      client.configId = id;
      client.configName = name;
      client.tenantId = tenantId;
      client.brokerUrl = brokerUrl;
      client.defaultQos = qos;
      client.defaultRetain = retain;

      // 设置事件监听器
      this.setupClientEventListeners(client);

      // 存储客户端
      this.clients.set(id, client);
      this.reconnectAttempts.set(id, 0);

      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, connectTimeout);

        client.on('connect', () => {
          clearTimeout(timeout);
          logger.mqttEvent('MQTT client connected', {
            configId: id,
            clientId: client.options.clientId,
            brokerUrl
          });
          resolve(client);
        });

        client.on('error', (error) => {
          clearTimeout(timeout);
          logger.error('MQTT connection error', {
            configId: id,
            error: error.message,
            brokerUrl
          });
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Failed to create MQTT connection', {
        configId: id,
        error: error.message
      });
      throw error;
    }
  }

  // 设置客户端事件监听器
  setupClientEventListeners(client) {
    const configId = client.configId;

    client.on('connect', () => {
      this.reconnectAttempts.set(configId, 0);
      this.emit('clientConnected', {
        configId,
        clientId: client.options.clientId,
        tenantId: client.tenantId
      });

      // 重新订阅之前的主题
      this.resubscribeTopics(client);
    });

    client.on('reconnect', () => {
      const attempts = this.reconnectAttempts.get(configId) || 0;
      this.reconnectAttempts.set(configId, attempts + 1);
      
      logger.mqttEvent('MQTT client reconnecting', {
        configId,
        attempts: attempts + 1,
        maxAttempts: this.maxReconnectAttempts
      });

      this.emit('clientReconnecting', {
        configId,
        attempts: attempts + 1
      });
    });

    client.on('close', () => {
      logger.mqttEvent('MQTT client disconnected', {
        configId,
        clientId: client.options.clientId
      });

      this.emit('clientDisconnected', {
        configId,
        clientId: client.options.clientId
      });
    });

    client.on('offline', () => {
      logger.mqttEvent('MQTT client offline', {
        configId,
        clientId: client.options.clientId
      });

      this.emit('clientOffline', {
        configId,
        clientId: client.options.clientId
      });
    });

    client.on('error', (error) => {
      logger.error('MQTT client error', {
        configId,
        error: error.message,
        clientId: client.options.clientId
      });

      this.emit('clientError', {
        configId,
        error: error.message,
        clientId: client.options.clientId
      });
    });

    client.on('message', (topic, message, packet) => {
      this.handleMessage(client, topic, message, packet);
    });
  }

  // 处理接收到的消息
  async handleMessage(client, topic, message, packet) {
    try {
      const messageStr = message.toString();
      let parsedMessage;

      // 尝试解析JSON消息
      try {
        parsedMessage = JSON.parse(messageStr);
      } catch (parseError) {
        parsedMessage = {
          raw: messageStr,
          timestamp: new Date().toISOString()
        };
      }

      const messageData = {
        topic,
        message: parsedMessage,
        qos: packet.qos,
        retain: packet.retain,
        clientId: client.options.clientId,
        configId: client.configId,
        tenantId: client.tenantId,
        receivedAt: new Date().toISOString()
      };

      logger.mqttEvent('Message received', {
        topic,
        configId: client.configId,
        messageSize: messageStr.length,
        qos: packet.qos
      });

      // 根据主题类型分发消息
      await this.routeMessage(messageData);

      // 触发通用消息事件
      this.emit('message', messageData);

    } catch (error) {
      logger.error('Error handling MQTT message', {
        topic,
        configId: client.configId,
        error: error.message
      });
    }
  }

  // 路由消息到相应的处理器
  async routeMessage(messageData) {
    const { topic, message } = messageData;

    try {
      // 设备数据主题: device/{deviceId}/data
      if (topic.match(/^device\/[^/]+\/data$/)) {
        const deviceId = topic.split('/')[1];
        await this.handleDeviceDataMessage(deviceId, message, messageData);
        return;
      }

      // 设备状态主题: device/{deviceId}/status
      if (topic.match(/^device\/[^/]+\/status$/)) {
        const deviceId = topic.split('/')[1];
        await this.handleDeviceStatusMessage(deviceId, message, messageData);
        return;
      }

      // 设备命令响应主题: device/{deviceId}/command/response
      if (topic.match(/^device\/[^/]+\/command\/response$/)) {
        const deviceId = topic.split('/')[1];
        await this.handleDeviceCommandResponse(deviceId, message, messageData);
        return;
      }

      // 自定义主题处理
      const handler = this.messageHandlers.get(topic);
      if (handler) {
        await handler(messageData);
        return;
      }

      // 默认处理：记录未处理的消息
      logger.mqttEvent('Unhandled message topic', {
        topic,
        configId: messageData.configId
      });

    } catch (error) {
      logger.error('Error routing MQTT message', {
        topic,
        error: error.message
      });
    }
  }

  // 处理设备数据消息
  async handleDeviceDataMessage(deviceId, message, messageData) {
    try {
      // 验证设备是否存在
      const device = await this.getDeviceInfo(deviceId);
      if (!device) {
        logger.warn('Received data for unknown device', { deviceId });
        return;
      }

      // 准备数据记录
      const dataRecord = {
        device_id: deviceId,
        data_type: message.type || 'sensor',
        value: message.value,
        unit: message.unit,
        timestamp: message.timestamp || new Date().toISOString(),
        raw_data: JSON.stringify(message),
        quality: message.quality || 'good',
        source: 'mqtt'
      };

      // 保存到数据库
      await this.saveDeviceData(dataRecord);

      // 更新设备最后活跃时间
      await this.updateDeviceLastSeen(deviceId);

      // 触发设备数据事件
      this.emit('deviceData', {
        deviceId,
        data: dataRecord,
        device,
        messageData
      });

      logger.mqttEvent('Device data processed', {
        deviceId,
        dataType: dataRecord.data_type,
        value: dataRecord.value
      });

    } catch (error) {
      logger.error('Error handling device data message', {
        deviceId,
        error: error.message
      });
    }
  }

  // 处理设备状态消息
  async handleDeviceStatusMessage(deviceId, message, messageData) {
    try {
      const device = await this.getDeviceInfo(deviceId);
      if (!device) {
        logger.warn('Received status for unknown device', { deviceId });
        return;
      }

      const status = message.status || message;
      const timestamp = message.timestamp || new Date().toISOString();

      // 更新设备状态
      await this.updateDeviceStatus(deviceId, status, timestamp);

      // 触发设备状态事件
      this.emit('deviceStatus', {
        deviceId,
        status,
        timestamp,
        device,
        messageData
      });

      logger.mqttEvent('Device status updated', {
        deviceId,
        status,
        previousStatus: device.status
      });

    } catch (error) {
      logger.error('Error handling device status message', {
        deviceId,
        error: error.message
      });
    }
  }

  // 处理设备命令响应
  async handleDeviceCommandResponse(deviceId, message, messageData) {
    try {
      const commandId = message.commandId;
      const result = message.result;
      const status = message.status || 'completed';
      const timestamp = message.timestamp || new Date().toISOString();

      // 更新命令状态
      if (commandId) {
        await this.updateCommandStatus(commandId, status, result, timestamp);
      }

      // 触发命令响应事件
      this.emit('deviceCommand', {
        deviceId,
        commandId,
        result,
        status,
        timestamp,
        messageData
      });

      logger.mqttEvent('Device command response received', {
        deviceId,
        commandId,
        status
      });

    } catch (error) {
      logger.error('Error handling device command response', {
        deviceId,
        error: error.message
      });
    }
  }

  // 订阅主题
  async subscribe(configId, topic, qos = 1) {
    const client = this.clients.get(configId);
    if (!client || !client.connected) {
      throw new Error(`MQTT client ${configId} not connected`);
    }

    return new Promise((resolve, reject) => {
      client.subscribe(topic, { qos }, (error, granted) => {
        if (error) {
          logger.error('MQTT subscription error', {
            configId,
            topic,
            error: error.message
          });
          reject(error);
        } else {
          // 存储订阅信息
          const clientSubs = this.subscriptions.get(configId) || new Set();
          clientSubs.add(topic);
          this.subscriptions.set(configId, clientSubs);

          logger.mqttEvent('MQTT topic subscribed', {
            configId,
            topic,
            qos: granted[0].qos
          });
          resolve(granted);
        }
      });
    });
  }

  // 取消订阅主题
  async unsubscribe(configId, topic) {
    const client = this.clients.get(configId);
    if (!client || !client.connected) {
      throw new Error(`MQTT client ${configId} not connected`);
    }

    return new Promise((resolve, reject) => {
      client.unsubscribe(topic, (error) => {
        if (error) {
          logger.error('MQTT unsubscription error', {
            configId,
            topic,
            error: error.message
          });
          reject(error);
        } else {
          // 移除订阅信息
          const clientSubs = this.subscriptions.get(configId);
          if (clientSubs) {
            clientSubs.delete(topic);
          }

          logger.mqttEvent('MQTT topic unsubscribed', {
            configId,
            topic
          });
          resolve();
        }
      });
    });
  }

  // 发布消息
  async publish(configId, topic, message, options = {}) {
    const client = this.clients.get(configId);
    if (!client || !client.connected) {
      throw new Error(`MQTT client ${configId} not connected`);
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    const publishOptions = {
      qos: options.qos || client.defaultQos || 1,
      retain: options.retain !== undefined ? options.retain : client.defaultRetain || false
    };

    return new Promise((resolve, reject) => {
      client.publish(topic, payload, publishOptions, (error) => {
        if (error) {
          logger.error('MQTT publish error', {
            configId,
            topic,
            error: error.message
          });
          reject(error);
        } else {
          logger.mqttEvent('MQTT message published', {
            configId,
            topic,
            messageSize: payload.length,
            qos: publishOptions.qos,
            retain: publishOptions.retain
          });
          resolve();
        }
      });
    });
  }

  // 重新订阅主题
  async resubscribeTopics(client) {
    const configId = client.configId;
    const topics = this.subscriptions.get(configId);
    
    if (topics && topics.size > 0) {
      for (const topic of topics) {
        try {
          await this.subscribe(configId, topic);
        } catch (error) {
          logger.error('Failed to resubscribe topic', {
            configId,
            topic,
            error: error.message
          });
        }
      }
    }
  }

  // 断开连接
  async disconnect(configId) {
    const client = this.clients.get(configId);
    if (!client) {
      return;
    }

    return new Promise((resolve) => {
      client.end(false, () => {
        this.clients.delete(configId);
        this.subscriptions.delete(configId);
        this.reconnectAttempts.delete(configId);
        
        logger.mqttEvent('MQTT client disconnected', {
          configId,
          clientId: client.options.clientId
        });
        
        resolve();
      });
    });
  }

  // 获取客户端状态
  getClientStatus(configId) {
    const client = this.clients.get(configId);
    if (!client) {
      return { connected: false, exists: false };
    }

    return {
      connected: client.connected,
      exists: true,
      clientId: client.options.clientId,
      brokerUrl: client.brokerUrl,
      subscriptions: Array.from(this.subscriptions.get(configId) || []),
      reconnectAttempts: this.reconnectAttempts.get(configId) || 0
    };
  }

  // 获取所有客户端状态
  getAllClientsStatus() {
    const status = {};
    for (const [configId, client] of this.clients) {
      status[configId] = this.getClientStatus(configId);
    }
    return status;
  }

  // 数据库操作辅助方法
  async getDeviceInfo(deviceId) {
    try {
      const result = await db.query(
        'SELECT * FROM devices WHERE device_id = $1',
        [deviceId]
      );
      return result.rows[0] || null;
    } catch (error) {
      logger.error('Error getting device info', {
        deviceId,
        error: error.message
      });
      return null;
    }
  }

  async saveDeviceData(dataRecord) {
    try {
      await db.query(
        `INSERT INTO device_data 
         (device_id, data_type, value, unit, timestamp, raw_data, quality, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          dataRecord.device_id,
          dataRecord.data_type,
          dataRecord.value,
          dataRecord.unit,
          dataRecord.timestamp,
          dataRecord.raw_data,
          dataRecord.quality,
          dataRecord.source
        ]
      );
    } catch (error) {
      logger.error('Error saving device data', {
        deviceId: dataRecord.device_id,
        error: error.message
      });
      throw error;
    }
  }

  async updateDeviceLastSeen(deviceId) {
    try {
      await db.query(
        'UPDATE devices SET last_seen = NOW() WHERE device_id = $1',
        [deviceId]
      );
    } catch (error) {
      logger.error('Error updating device last seen', {
        deviceId,
        error: error.message
      });
    }
  }

  async updateDeviceStatus(deviceId, status, timestamp) {
    try {
      await db.query(
        'UPDATE devices SET status = $1, last_seen = $2 WHERE device_id = $1',
        [status, timestamp, deviceId]
      );
    } catch (error) {
      logger.error('Error updating device status', {
        deviceId,
        status,
        error: error.message
      });
      throw error;
    }
  }

  async updateCommandStatus(commandId, status, result, timestamp) {
    try {
      await db.query(
        `UPDATE device_commands 
         SET status = $1, result = $2, completed_at = $3 
         WHERE id = $4`,
        [status, JSON.stringify(result), timestamp, commandId]
      );
    } catch (error) {
      logger.error('Error updating command status', {
        commandId,
        status,
        error: error.message
      });
    }
  }

  // 注册自定义消息处理器
  registerMessageHandler(topic, handler) {
    this.messageHandlers.set(topic, handler);
    logger.mqttEvent('Message handler registered', { topic });
  }

  // 移除消息处理器
  unregisterMessageHandler(topic) {
    this.messageHandlers.delete(topic);
    logger.mqttEvent('Message handler unregistered', { topic });
  }

  // 清理所有连接
  async cleanup() {
    const disconnectPromises = [];
    for (const configId of this.clients.keys()) {
      disconnectPromises.push(this.disconnect(configId));
    }
    await Promise.all(disconnectPromises);
    logger.mqttEvent('MQTT manager cleanup completed');
  }
}

// 创建MQTT管理器实例
const mqttManager = new MQTTManager();

// 导出MQTT管理器
module.exports = mqttManager;

// 导出MQTT管理器类
module.exports.MQTTManager = MQTTManager;

// 处理进程退出时的清理
// 注意：信号处理器已移至app.js主文件中统一管理
// 这里移除SIGINT/SIGTERM处理器，避免冲突
/*
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, cleaning up MQTT connections...');
  await mqttManager.cleanup();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, cleaning up MQTT connections...');
  await mqttManager.cleanup();
});
*/