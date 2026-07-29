const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { User, Device } = require('../models');
const logger = require('../utils/logger');


// WebSocket连接限制，防止内存泄漏
const MAX_CONNECTIONS = 100;
const HEARTBEAT_INTERVAL = 60000; // 60秒心跳间隔

const maskToken = (token) => {
  if (!token) return null;
  if (token.length <= 12) return '***';
  return `${token.slice(0, 6)}...${token.slice(-6)}`;
};

const sanitizeUrl = (rawUrl) => {
  try {
    const url = new URL(rawUrl, 'http://localhost');
    if (url.searchParams.has('token')) {
      url.searchParams.set('token', '[redacted]');
    }
    return `${url.pathname}${url.search}`;
  } catch (error) {
    return rawUrl && rawUrl.includes('token=') ? rawUrl.replace(/token=[^&]+/g, 'token=[redacted]') : rawUrl;
  }
};

const getAllowedOrigins = () => {
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  if (configuredOrigins.length > 0) {
    return configuredOrigins;
  }

  return [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://127.0.0.1:3003',
    'http://127.0.0.1:3004',
    'http://127.0.0.1:8080',
    'http://mqtt.boningse.com',
    'https://mqtt.boningse.com',
    'http://192.168.10.139'
  ];
};

class WebSocketService {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // 存储客户端连接信息
    this.heartbeatInterval = parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000;
    this.heartbeatTimer = null;
  }

  /**
   * 初始化WebSocket服务器
   */
  init(server) {
    logger.info('=== 初始化WebSocket服务器 ===');
    
    // 绑定verifyClient方法到当前实例
    const boundVerifyClient = this.verifyClient.bind(this);
    
    this.wss = new WebSocket.Server({
      server,
      path: '/ws',
      verifyClient: (info, callback) => {
        logger.info('=== verifyClient 回调被调用 ===', {
          url: sanitizeUrl(info.req.url),
          method: info.req.method,
          hasToken: info.req.url.includes('token=')
        });
        
        boundVerifyClient(info)
          .then(result => {
            logger.info('verifyClient 结果', { result });
            callback(result);
          })
          .catch(error => {
            logger.error('WebSocket验证错误', { error: error.message });
            callback(false, 500, 'Internal Server Error');
          });
      }
    });

    logger.info('WebSocket服务器配置', {
      path: '/ws',
      hasVerifyClient: !!this.wss.options.verifyClient
    });

    this.wss.on('connection', (ws, req) => {
      logger.info('WebSocket连接事件触发');
      this.handleConnection(ws, req);
    });
    this.startHeartbeat();
    
    logger.info('WebSocket服务器已启动');
  }

  /**
   * 验证WebSocket客户端连接
   */
  async verifyClient(info) {
    logger.info('=== verifyClient 被调用 ===');
    
    // 检查Origin头部，允许跨域访问
    const origin = info.origin || info.req.headers.origin;
    const allowedOrigins = getAllowedOrigins();
    
    const isWeChatMiniProgramOrigin = origin === 'https://servicewechat.com';
    if (origin && !allowedOrigins.includes(origin) && !isWeChatMiniProgramOrigin) {
      logger.warn(`WebSocket连接被拒绝，不允许的Origin: ${origin}`);
      return false;
    }
    
    logger.info(`WebSocket连接允许，Origin: ${origin || '无Origin头部'}`);
    
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      let token = url.searchParams.get('token');
      
      // 如果URL参数中没有token，尝试从Authorization header获取
      if (!token && info.req.headers.authorization) {
        const authHeader = info.req.headers.authorization;
        if (authHeader.startsWith('Bearer ')) {
          token = authHeader.substring(7);
        }
      }

      logger.info('WebSocket验证客户端', { 
        hasToken: !!token,
        url: sanitizeUrl(info.req.url),
        hasAuthHeader: !!info.req.headers.authorization,
        tokenPreview: maskToken(token)
      });
      
      if (!token) {
        logger.warn('WebSocket连接缺少token，拒绝连接');
        return false;
      }

      // 验证JWT token
      logger.info('开始验证JWT token', { tokenLength: token.length });
      
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
        logger.info('JWT token解码成功', { 
          userId: decoded.id,
          username: decoded.username,
          decodedKeys: Object.keys(decoded)
        });
      } catch (jwtError) {
        logger.error('JWT token验证失败', { error: jwtError.message });
        return false;
      }
      
      const tokenUserId = decoded.id || decoded.userId;
      const user = await User.findByPk(tokenUserId);

      logger.info('用户查询结果', { 
        found: !!user,
        userId: user ? user.id : null,
        username: user ? user.username : null,
        status: user ? user.status : null
      });
      
      if (!user || user.status !== 'active') {
        logger.warn('WebSocket连接用户无效，拒绝连接', {
          userFound: !!user,
          userStatus: user ? user.status : null
        });
        return false;
      }

      // 将用户信息附加到请求对象
      info.req.user = user;
      logger.info('WebSocket用户认证成功', { 
        userId: user.id,
        username: user.username 
      });
      return true;
      
    } catch (error) {
      logger.warn('WebSocket连接验证失败，拒绝连接', { error: error.message });
      return false;
    }
  }

  /**
   * 处理新的WebSocket连接
   */
  
    /**
     * 检查连接数限制
     */
    checkConnectionLimit() {
        if (this.clients.size >= MAX_CONNECTIONS) {
            // 关闭最旧的连接
            const oldestClient = Array.from(this.clients.values())
                .sort((a, b) => a.connectedAt - b.connectedAt)[0];
            if (oldestClient) {
                oldestClient.ws.close(1000, 'Connection limit exceeded');
                logger.warn('达到连接数限制，关闭最旧连接', { 
                    totalConnections: this.clients.size,
                    maxConnections: MAX_CONNECTIONS 
                });
            }
        }
    }

    handleConnection(ws, req) {
    const user = req.user;
    const clientId = this.generateClientId();
    
    logger.info('WebSocket连接处理', { 
      hasUser: !!user,
      userInfo: user ? { id: user.id, username: user.username } : null,
      clientId 
    });
    
    // 存储客户端信息
    this.checkConnectionLimit();
    
    const clientInfo = {
      ws,
      user,
      lastPing: Date.now(),
      connectedAt: Date.now(),
      subscriptions: new Set([
        'device_data',
        'device_status_update',
        'device_offline',
        'device_response',
        'device_event',
        'communication_log',
        'work_order_updated',
        'work_order_assigned'
      ])
    };
    
    this.clients.set(clientId, clientInfo);
    
    logger.debug('客户端已添加到clients Map', {
      clientId,
      totalClients: this.clients.size,
      hasClient: this.clients.has(clientId)
    });

    const username = user ? user.username : 'unknown';
    logger.info('WebSocket客户端连接', { username, clientId });

    // 发送连接成功消息
    this.sendToClient(clientId, {
      type: 'connection',
      status: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });

    // 处理客户端消息
    ws.on('message', (message) => {
      this.handleMessage(clientId, message);
    });

    // 处理连接关闭
    ws.on('close', () => {
      this.handleDisconnection(clientId);
    });

    // 处理连接错误
    ws.on('error', (error) => {
      logger.error('WebSocket客户端错误', { clientId, error: error.message });
      this.handleDisconnection(clientId);
    });

    // 处理pong响应
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = Date.now();
      }
    });
  }

  /**
   * 处理客户端消息
   */
  handleMessage(clientId, message) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      const data = JSON.parse(message.toString());
      logger.debug('收到WebSocket消息', { clientId, type: data.type });

      switch (data.type) {
        case 'ping':
          this.handlePing(clientId);
          break;
        case 'subscribe':
          this.handleSubscribe(clientId, data.topics);
          break;
        case 'unsubscribe':
          this.handleUnsubscribe(clientId, data.topics);
          break;
        case 'device_command':
          this.handleDeviceCommand(clientId, data);
          break;
        default:
          logger.warn('未知的消息类型', { type: data.type });
      }
    } catch (error) {
      logger.error('处理WebSocket消息失败', { clientId, error: error.message });
    }
  }

  /**
   * 处理ping消息
   */
  handlePing(clientId) {
    this.sendToClient(clientId, {
      type: 'pong',
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 处理订阅
   */
  handleSubscribe(clientId, topics) {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (!client.user) {
      this.sendToClient(clientId, {
        type: 'error',
        message: '需要登录后才能订阅主题',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (Array.isArray(topics)) {
      topics.forEach(topic => {
        if (topic === '*' && client.user.role !== 'admin') {
          return;
        }
        client.subscriptions.add(topic);
      });
    }

    this.sendToClient(clientId, {
      type: 'subscribed',
      topics,
      timestamp: new Date().toISOString()
    });

    logger.info('客户端订阅主题', { clientId, topics });
  }

  /**
   * 处理取消订阅
   */
  handleUnsubscribe(clientId, topics) {
    const client = this.clients.get(clientId);
    if (!client) return;

    if (Array.isArray(topics)) {
      topics.forEach(topic => {
        client.subscriptions.delete(topic);
      });
    }

    this.sendToClient(clientId, {
      type: 'unsubscribed',
      topics,
      timestamp: new Date().toISOString()
    });

    logger.info('客户端取消订阅主题', { clientId, topics });
  }

  /**
   * 处理设备命令
   */
  async handleDeviceCommand(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) return;

      // 调试日志
      logger.info('处理设备命令', { 
        clientId, 
        hasUser: !!client.user,
        userInfo: client.user ? { id: client.user.id, username: client.user.username } : null,
        command: data 
      });

      // 检查用户权限
      if (!client.user) {
        logger.warn('设备命令被拒绝：用户未认证', { clientId });
        this.sendToClient(clientId, {
          type: 'error',
          message: '需要登录才能发送设备命令',
          timestamp: new Date().toISOString()
        });
        return;
      }
      const device = await Device.findByPk(data.deviceId, {
        attributes: ['id', 'tenant_id']
      });
      if (!device) {
        this.sendToClient(clientId, {
          type: 'error',
          message: '设备不存在',
          timestamp: new Date().toISOString()
        });
        return;
      }
      const isAdmin = client.user.role === 'admin';
      if (!isAdmin && device.tenant_id !== client.user.tenant_id) {
        logger.warn('设备命令被拒绝：越权设备访问', {
          clientId,
          userId: client.user.id,
          userTenantId: client.user.tenant_id,
          deviceId: data.deviceId,
          deviceTenantId: device.tenant_id
        });
        this.sendToClient(clientId, {
          type: 'error',
          message: '无权限控制该设备',
          timestamp: new Date().toISOString()
        });
        return;
      }

      const mqttService = require('./mqttService');
      // 如果有parameters，将其合并到command中，否则直接发送command
      let commandData = data.command;
      if (data.parameters && Object.keys(data.parameters).length > 0) {
        if (typeof data.command === 'object') {
          commandData = { ...data.command, ...data.parameters };
        } else {
          commandData = { command: data.command, parameters: data.parameters };
        }
      }
      await mqttService.sendCommandToDevice(data.deviceId, commandData);

      this.sendToClient(clientId, {
        type: 'command_sent',
        deviceId: data.deviceId,
        command: data.command,
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      logger.error('处理设备命令失败', { clientId, error: error.message });
      this.sendToClient(clientId, {
        type: 'error',
        message: '发送设备命令失败',
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * 处理连接断开
   */
  handleDisconnection(clientId) {
    const client = this.clients.get(clientId);
    if (client) {
      const username = client.user ? client.user.username : 'anonymous';
      logger.info('WebSocket客户端断开', { username, clientId });
      this.clients.delete(clientId);
    }
  }

  /**
   * 发送消息到指定客户端
   */
  sendToClient(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      client.ws.send(JSON.stringify(data));
      return true;
    } catch (error) {
      logger.error('发送WebSocket消息失败', { clientId, error: error.message });
      this.handleDisconnection(clientId);
      return false;
    }
  }

  /**
   * 广播消息到所有订阅的客户端
   */
  broadcastToClients(type, data, filter = null) {
    const message = {
      type,
      payload: data, // 将数据放在payload字段中，保持原始结构
      timestamp: data.timestamp || new Date().toISOString()
    };

    let sentCount = 0;
    this.clients.forEach((client, clientId) => {
      if (!this.canClientReceiveMessage(client, type, data)) {
        return;
      }
      // 应用过滤器
      if (filter && !filter(client)) {
        return;
      }

      // 检查客户端是否订阅了该类型的消息
      if (client.subscriptions.has(type) || client.subscriptions.has('*')) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    });

    logger.debug('广播消息', { type, sentCount, dataKeys: Object.keys(data) });
    return sentCount;
  }

  canClientReceiveMessage(client, type, data) {
    if (!client || !client.user) {
      return false;
    }

    if (client.user.role === 'admin') {
      return true;
    }

    const tenantScopedTopics = new Set([
      'device_data',
      'device_heartbeat',
      'device_status_update',
      'device_offline',
      'device_response',
      'device_event',
      'communication_log',
      'lighting_switch_status',
      'lighting_electrical_data',
      'lighting_scene_created',
      'lighting_scene_updated',
      'lighting_scene_deleted',
      'electric_meter_data',
      'device_updated',
      'device_deleted',
      'device_status_changed',
      'thermostat_controlled',
      'thermostat_device_added',
      'thermostat_device_deleted',
      'scene_executed',
      'work_order_updated',
      'work_order_assigned'
    ]);

    if (!tenantScopedTopics.has(type)) {
      return true;
    }

    const dataTenantId =
      data?.tenant_id ||
      data?.tenantId ||
      data?.tenant?.id ||
      data?.device?.tenant_id ||
      data?.payload?.tenant_id ||
      data?.payload?.tenantId;

    if (!dataTenantId) {
      return false;
    }

    return dataTenantId === client.user.tenant_id;
  }

  /**
   * 发送消息到指定租户的所有客户端
   */
  broadcastToTenant(tenantId, type, data) {
    return this.broadcastToClients(type, data, (client) => {
      return client.user && client.user.tenant_id === tenantId;
    });
  }

  /**
   * 发送消息到指定用户
   */
  sendToUser(userId, type, data) {
    const message = {
      type,
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    };

    let sentCount = 0;
    this.clients.forEach((client, clientId) => {
      if (client.user && client.user.id === userId) {
        if (this.sendToClient(clientId, message)) {
          sentCount++;
        }
      }
    });

    return sentCount;
  }

  /**
   * 启动心跳检测
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.heartbeatInterval * 2; // 超时时间为心跳间隔的2倍

      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          // 检查是否超时
          if (now - client.lastPing > timeout) {
            logger.info('客户端心跳超时，断开连接', { clientId });
            client.ws.terminate();
            this.handleDisconnection(clientId);
          } else {
            // 发送ping
            client.ws.ping();
          }
        } else {
          // 清理无效连接
          this.handleDisconnection(clientId);
        }
      });
    }, this.heartbeatInterval);

    logger.info('WebSocket心跳检测已启动', { interval: this.heartbeatInterval });
  }

  /**
   * 停止心跳检测
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('WebSocket心跳检测已停止');
    }
  }

  /**
   * 生成客户端ID
   */
  generateClientId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取连接统计信息
   */
  getStats() {
    const stats = {
      totalConnections: this.clients.size,
      connectionsByTenant: {},
      connectionsByUser: {},
      anonymousConnections: 0
    };

    this.clients.forEach((client) => {
      if (client.user) {
        // 按租户统计
        const tenantId = client.user.tenant_id || 'unknown';
        stats.connectionsByTenant[tenantId] = (stats.connectionsByTenant[tenantId] || 0) + 1;

        // 按用户统计
        const userId = client.user.id;
        stats.connectionsByUser[userId] = (stats.connectionsByUser[userId] || 0) + 1;
      } else {
        stats.anonymousConnections++;
      }
    });

    return stats;
  }

  /**
   * 关闭WebSocket服务器
   */
  close() {
    this.stopHeartbeat();
    
    if (this.wss) {
      this.wss.close(() => {
        logger.info('WebSocket服务器已关闭');
      });
    }

    // 断开所有客户端连接
    this.clients.forEach((client, clientId) => {
      client.ws.terminate();
    });
    this.clients.clear();
  }
}

module.exports = new WebSocketService();
