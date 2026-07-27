const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const url = require('url');
const logger = require('./logger');
const db = require('./database');

// WebSocket管理器类
class WebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Map(); // 存储客户端连接信息
    this.rooms = new Map(); // 存储房间信息
    this.heartbeatInterval = 30000; // 30秒心跳间隔
    this.heartbeatTimer = null;
    
    // 消息类型定义
    this.MESSAGE_TYPES = {
      AUTH: 'auth',
      HEARTBEAT: 'heartbeat',
      JOIN_ROOM: 'join_room',
      LEAVE_ROOM: 'leave_room',
      DEVICE_DATA: 'device_data',
      DEVICE_STATUS: 'device_status',
      DEVICE_COMMAND: 'device_command',
      TENANT_UPDATE: 'tenant_update',
      USER_UPDATE: 'user_update',
      SYSTEM_ALERT: 'system_alert',
      NOTIFICATION: 'notification',
      ERROR: 'error'
    };
  }

  // 初始化WebSocket服务器
  initialize(server, options = {}) {
    const wsOptions = {
      server,
      path: options.path || '/ws',
      clientTracking: true,
      maxPayload: options.maxPayload || 1024 * 1024, // 1MB
      ...options
    };

    this.wss = new WebSocket.Server(wsOptions);
    
    // 设置连接处理
    this.wss.on('connection', (ws, request) => {
      this.handleConnection(ws, request);
    });

    // 设置错误处理
    this.wss.on('error', (error) => {
      logger.error('WebSocket server error', {
        error: error.message,
        stack: error.stack
      });
    });

    // 启动心跳检测
    this.startHeartbeat();

    logger.info('WebSocket server initialized', {
      path: wsOptions.path,
      maxPayload: wsOptions.maxPayload
    });

    return this.wss;
  }

  // 处理新连接
  handleConnection(ws, request) {
    const clientId = this.generateClientId();
    const clientInfo = {
      id: clientId,
      ws,
      authenticated: false,
      user: null,
      tenantId: null,
      rooms: new Set(),
      lastHeartbeat: Date.now(),
      connectedAt: new Date().toISOString(),
      ip: this.getClientIP(request),
      userAgent: request.headers['user-agent']
    };

    // 存储客户端信息
    this.clients.set(clientId, clientInfo);
    ws.clientId = clientId;

    logger.info('WebSocket client connected', {
      clientId,
      ip: clientInfo.ip,
      userAgent: clientInfo.userAgent
    });

    // 设置消息处理
    ws.on('message', (data) => {
      this.handleMessage(clientId, data);
    });

    // 设置连接关闭处理
    ws.on('close', (code, reason) => {
      this.handleDisconnection(clientId, code, reason);
    });

    // 设置错误处理
    ws.on('error', (error) => {
      logger.error('WebSocket client error', {
        clientId,
        error: error.message
      });
    });

    // 发送连接确认
    this.sendToClient(clientId, {
      type: 'connected',
      clientId,
      timestamp: new Date().toISOString()
    });
  }

  // 处理客户端消息
  async handleMessage(clientId, data) {
    try {
      const client = this.clients.get(clientId);
      if (!client) {
        return;
      }

      // 解析消息
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (parseError) {
        this.sendError(clientId, 'Invalid JSON format');
        return;
      }

      const { type, payload } = message;

      logger.debug('WebSocket message received', {
        clientId,
        type,
        authenticated: client.authenticated
      });

      // 更新心跳时间
      client.lastHeartbeat = Date.now();

      // 处理不同类型的消息
      switch (type) {
        case this.MESSAGE_TYPES.AUTH:
          await this.handleAuth(clientId, payload);
          break;

        case this.MESSAGE_TYPES.HEARTBEAT:
          this.handleHeartbeat(clientId, payload);
          break;

        case this.MESSAGE_TYPES.JOIN_ROOM:
          await this.handleJoinRoom(clientId, payload);
          break;

        case this.MESSAGE_TYPES.LEAVE_ROOM:
          await this.handleLeaveRoom(clientId, payload);
          break;

        case this.MESSAGE_TYPES.DEVICE_COMMAND:
          await this.handleDeviceCommand(clientId, payload);
          break;

        default:
          // 需要认证的消息
          if (!client.authenticated) {
            this.sendError(clientId, 'Authentication required');
            return;
          }
          
          // 处理其他消息类型
          await this.handleCustomMessage(clientId, type, payload);
          break;
      }

    } catch (error) {
      logger.error('Error handling WebSocket message', {
        clientId,
        error: error.message,
        stack: error.stack
      });
      this.sendError(clientId, 'Internal server error');
    }
  }

  // 处理认证
  async handleAuth(clientId, payload) {
    try {
      const { token } = payload;
      
      if (!token) {
        this.sendError(clientId, 'Token required');
        return;
      }

      // 验证JWT令牌
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded.userId;

      // 获取用户信息
      const userResult = await db.query(
        `SELECT u.*, t.name as tenant_name 
         FROM users u 
         LEFT JOIN tenants t ON u.tenant_id = t.id 
         WHERE u.id = $1 AND u.status = 'active'`,
        [userId]
      );

      if (userResult.rows.length === 0) {
        this.sendError(clientId, 'Invalid user');
        return;
      }

      const user = userResult.rows[0];
      const client = this.clients.get(clientId);
      
      // 更新客户端信息
      client.authenticated = true;
      client.user = user;
      client.tenantId = user.tenant_id;

      logger.info('WebSocket client authenticated', {
        clientId,
        userId: user.id,
        username: user.username,
        tenantId: user.tenant_id
      });

      // 发送认证成功响应
      this.sendToClient(clientId, {
        type: 'auth_success',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          tenantId: user.tenant_id,
          tenantName: user.tenant_name
        },
        timestamp: new Date().toISOString()
      });

      // 自动加入租户房间（如果有租户）
      if (user.tenant_id) {
        await this.joinRoom(clientId, `tenant_${user.tenant_id}`);
      }

      // 加入用户角色房间
      await this.joinRoom(clientId, `role_${user.role}`);

    } catch (error) {
      logger.error('WebSocket authentication error', {
        clientId,
        error: error.message
      });
      this.sendError(clientId, 'Authentication failed');
    }
  }

  // 处理心跳
  handleHeartbeat(clientId, payload) {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastHeartbeat = Date.now();
      this.sendToClient(clientId, {
        type: 'heartbeat_ack',
        timestamp: new Date().toISOString()
      });
    }
  }

  // 处理加入房间
  async handleJoinRoom(clientId, payload) {
    const { room } = payload;
    
    if (!room) {
      this.sendError(clientId, 'Room name required');
      return;
    }

    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    // 检查权限
    if (!await this.checkRoomPermission(client, room)) {
      this.sendError(clientId, 'Access denied to room');
      return;
    }

    await this.joinRoom(clientId, room);
  }

  // 处理离开房间
  async handleLeaveRoom(clientId, payload) {
    const { room } = payload;
    
    if (!room) {
      this.sendError(clientId, 'Room name required');
      return;
    }

    await this.leaveRoom(clientId, room);
  }

  // 处理设备命令
  async handleDeviceCommand(clientId, payload) {
    const client = this.clients.get(clientId);
    if (!client || !client.authenticated) {
      this.sendError(clientId, 'Authentication required');
      return;
    }

    const { deviceId, command, parameters } = payload;

    // 检查设备权限
    const hasPermission = await this.checkDevicePermission(client, deviceId);
    if (!hasPermission) {
      this.sendError(clientId, 'Access denied to device');
      return;
    }

    // 这里可以集成MQTT管理器来发送设备命令
    // 暂时只记录日志
    logger.info('Device command received via WebSocket', {
      clientId,
      userId: client.user.id,
      deviceId,
      command,
      parameters
    });

    // 发送命令确认
    this.sendToClient(clientId, {
      type: 'command_sent',
      deviceId,
      command,
      timestamp: new Date().toISOString()
    });
  }

  // 处理自定义消息
  async handleCustomMessage(clientId, type, payload) {
    logger.debug('Custom WebSocket message', {
      clientId,
      type,
      payload
    });
    
    // 这里可以添加自定义消息处理逻辑
  }

  // 加入房间
  async joinRoom(clientId, roomName) {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // 添加客户端到房间
    if (!this.rooms.has(roomName)) {
      this.rooms.set(roomName, new Set());
    }
    this.rooms.get(roomName).add(clientId);
    
    // 添加房间到客户端
    client.rooms.add(roomName);

    logger.debug('Client joined room', {
      clientId,
      roomName,
      roomSize: this.rooms.get(roomName).size
    });

    // 发送加入房间确认
    this.sendToClient(clientId, {
      type: 'room_joined',
      room: roomName,
      timestamp: new Date().toISOString()
    });
  }

  // 离开房间
  async leaveRoom(clientId, roomName) {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    // 从房间移除客户端
    const room = this.rooms.get(roomName);
    if (room) {
      room.delete(clientId);
      if (room.size === 0) {
        this.rooms.delete(roomName);
      }
    }
    
    // 从客户端移除房间
    client.rooms.delete(roomName);

    logger.debug('Client left room', {
      clientId,
      roomName,
      roomSize: room ? room.size : 0
    });

    // 发送离开房间确认
    this.sendToClient(clientId, {
      type: 'room_left',
      room: roomName,
      timestamp: new Date().toISOString()
    });
  }

  // 检查房间权限
  async checkRoomPermission(client, roomName) {
    const user = client.user;
    
    // 管理员可以访问所有房间
    if (user.role === 'admin') {
      return true;
    }

    // 租户房间权限检查
    if (roomName.startsWith('tenant_')) {
      const tenantId = roomName.replace('tenant_', '');
      return user.tenant_id && user.tenant_id.toString() === tenantId;
    }

    // 角色房间权限检查
    if (roomName.startsWith('role_')) {
      const role = roomName.replace('role_', '');
      return user.role === role;
    }

    // 设备房间权限检查
    if (roomName.startsWith('device_')) {
      const deviceId = roomName.replace('device_', '');
      return await this.checkDevicePermission(client, deviceId);
    }

    // 默认拒绝访问
    return false;
  }

  // 检查设备权限
  async checkDevicePermission(client, deviceId) {
    try {
      const user = client.user;
      
      // 管理员可以访问所有设备
      if (user.role === 'admin') {
        return true;
      }

      // 检查设备是否属于用户的租户
      const result = await db.query(
        'SELECT tenant_id FROM devices WHERE device_id = $1',
        [deviceId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const deviceTenantId = result.rows[0].tenant_id;
      return user.tenant_id && user.tenant_id === deviceTenantId;

    } catch (error) {
      logger.error('Error checking device permission', {
        deviceId,
        userId: client.user.id,
        error: error.message
      });
      return false;
    }
  }

  // 发送消息给特定客户端
  sendToClient(clientId, message) {
    const client = this.clients.get(clientId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const messageStr = JSON.stringify({
        ...message,
        timestamp: message.timestamp || new Date().toISOString()
      });
      
      client.ws.send(messageStr);
      return true;
    } catch (error) {
      logger.error('Error sending message to client', {
        clientId,
        error: error.message
      });
      return false;
    }
  }

  // 发送错误消息
  sendError(clientId, errorMessage) {
    this.sendToClient(clientId, {
      type: this.MESSAGE_TYPES.ERROR,
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }

  // 广播消息到房间
  broadcastToRoom(roomName, message) {
    const room = this.rooms.get(roomName);
    if (!room) {
      return 0;
    }

    let sentCount = 0;
    for (const clientId of room) {
      if (this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug('Message broadcasted to room', {
      roomName,
      sentCount,
      totalClients: room.size
    });

    return sentCount;
  }

  // 广播消息到租户
  broadcastToTenant(tenantId, message) {
    return this.broadcastToRoom(`tenant_${tenantId}`, message);
  }

  // 广播消息到角色
  broadcastToRole(role, message) {
    return this.broadcastToRoom(`role_${role}`, message);
  }

  // 广播消息到所有认证用户
  broadcastToAll(message) {
    let sentCount = 0;
    for (const [clientId, client] of this.clients) {
      if (client.authenticated && this.sendToClient(clientId, message)) {
        sentCount++;
      }
    }

    logger.debug('Message broadcasted to all clients', {
      sentCount,
      totalClients: this.clients.size
    });

    return sentCount;
  }

  // 处理断开连接
  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId);
    if (!client) {
      return;
    }

    logger.info('WebSocket client disconnected', {
      clientId,
      code,
      reason: reason.toString(),
      userId: client.user ? client.user.id : null,
      connectedDuration: Date.now() - new Date(client.connectedAt).getTime()
    });

    // 从所有房间移除客户端
    for (const roomName of client.rooms) {
      const room = this.rooms.get(roomName);
      if (room) {
        room.delete(clientId);
        if (room.size === 0) {
          this.rooms.delete(roomName);
        }
      }
    }

    // 移除客户端
    this.clients.delete(clientId);
  }

  // 启动心跳检测
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const now = Date.now();
      const timeout = this.heartbeatInterval * 2; // 2倍心跳间隔作为超时

      for (const [clientId, client] of this.clients) {
        if (now - client.lastHeartbeat > timeout) {
          logger.warn('Client heartbeat timeout', {
            clientId,
            lastHeartbeat: new Date(client.lastHeartbeat).toISOString()
          });
          
          // 关闭超时连接
          client.ws.terminate();
        }
      }
    }, this.heartbeatInterval);

    logger.info('WebSocket heartbeat started', {
      interval: this.heartbeatInterval
    });
  }

  // 停止心跳检测
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
      logger.info('WebSocket heartbeat stopped');
    }
  }

  // 获取客户端IP
  getClientIP(request) {
    return request.headers['x-forwarded-for'] ||
           request.headers['x-real-ip'] ||
           request.connection.remoteAddress ||
           request.socket.remoteAddress ||
           (request.connection.socket ? request.connection.socket.remoteAddress : null);
  }

  // 生成客户端ID
  generateClientId() {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 获取连接统计
  getStats() {
    const authenticatedClients = Array.from(this.clients.values())
      .filter(client => client.authenticated);
    
    const tenantStats = {};
    const roleStats = {};
    
    authenticatedClients.forEach(client => {
      if (client.tenantId) {
        tenantStats[client.tenantId] = (tenantStats[client.tenantId] || 0) + 1;
      }
      if (client.user && client.user.role) {
        roleStats[client.user.role] = (roleStats[client.user.role] || 0) + 1;
      }
    });

    return {
      totalConnections: this.clients.size,
      authenticatedConnections: authenticatedClients.length,
      totalRooms: this.rooms.size,
      tenantStats,
      roleStats,
      rooms: Array.from(this.rooms.entries()).map(([name, clients]) => ({
        name,
        clientCount: clients.size
      }))
    };
  }

  // 关闭WebSocket服务器
  async close() {
    this.stopHeartbeat();
    
    // 关闭所有客户端连接
    for (const [clientId, client] of this.clients) {
      client.ws.close(1001, 'Server shutting down');
    }
    
    // 关闭WebSocket服务器
    if (this.wss) {
      this.wss.close();
    }
    
    logger.info('WebSocket server closed');
  }
}

// 创建WebSocket管理器实例
const wsManager = new WebSocketManager();

// 导出WebSocket管理器
module.exports = wsManager;

// 导出WebSocket管理器类
module.exports.WebSocketManager = WebSocketManager;

// 处理进程退出时的清理
// 注意：信号处理器已移至app.js主文件中统一管理
// 这里移除SIGINT/SIGTERM处理器，避免冲突
/*
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, closing WebSocket server...');
  await wsManager.close();
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, closing WebSocket server...');
  await wsManager.close();
});
*/