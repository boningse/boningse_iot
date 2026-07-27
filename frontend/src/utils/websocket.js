/**
 * WebSocket 客户端服务
 * 用于接收后端实时推送的设备状态、数据等信息
 */

class WebSocketService {
  constructor() {
    this.ws = null
    this.reconnectTimer = null
    this.heartbeatTimer = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 5
    this.reconnectInterval = 3000
    this.heartbeatInterval = 30000
    this.listeners = new Map()
    this.isConnecting = false
  }

  /**
   * 连接WebSocket
   */
  connect() {
    if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.OPEN)) {
      return
    }

    this.isConnecting = true
    
    // 获取认证token
    const token = localStorage.getItem('token')
    if (!token) {
      console.error('❌ 未找到认证token，无法连接WebSocket')
      this.isConnecting = false
      return
    }
    
    // 构建带token的WebSocket URL
    let baseWsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost/ws'
    
    // 自动根据当前页面协议和主机选择WebSocket协议和地址
    if (window.location.protocol === 'https:') {
      // 在HTTPS环境下，使用wss协议和当前域名
      baseWsUrl = `wss://${window.location.host}/ws`
    } else {
      // 在HTTP环境下，使用ws协议和当前域名
      baseWsUrl = `ws://${window.location.host}/ws`
    }
    
    const wsUrl = `${baseWsUrl}?token=${encodeURIComponent(token)}`

    try {
      console.log('🔌 尝试连接WebSocket:', baseWsUrl, '(带认证token)')
      this.ws = new WebSocket(wsUrl)

      // 设置连接超时
      const connectTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.warn('⏰ WebSocket连接超时')
          this.ws.close()
          this.isConnecting = false
        }
      }, 10000) // 10秒超时

      this.ws.onopen = () => {
        console.log('✅ WebSocket连接已建立')
        clearTimeout(connectTimeout)
        this.isConnecting = false
        this.reconnectAttempts = 0
        this.startHeartbeat()

        // 自动订阅所有设备相关主题
        this.subscribe([
          'device_status_update',
          'device_offline',
          'device_data',
          'device_response',
          'device_event',
          'communication_log'
        ])

        this.emit('connected')
      }

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          console.log('📨 收到WebSocket消息:', data)

          // 处理心跳响应
          if (data.type === 'pong') {
            return
          }

          // 分发消息到监听器
          this.emit(data.type, data.payload)

        } catch (error) {
          console.error('❌ 解析WebSocket消息失败:', error)
        }
      }

      this.ws.onclose = (event) => {
        console.log('🔌 WebSocket连接已关闭:', event.code, event.reason)
        clearTimeout(connectTimeout)
        this.isConnecting = false
        this.stopHeartbeat()
        this.emit('disconnected')

        // 根据关闭代码决定是否重连
        if (event.code !== 1000 && event.code !== 1001) { // 非正常关闭
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log(`🔄 准备重连 (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`)
            this.scheduleReconnect()
          } else {
            console.error('❌ WebSocket重连次数已达上限，停止重连')
            this.emit('max_reconnect_reached')
          }
        }
      }

      this.ws.onerror = (error) => {
        console.error('❌ WebSocket连接错误:', error)
        clearTimeout(connectTimeout)
        this.isConnecting = false
        this.emit('error', error)
      }

    } catch (error) {
      console.error('❌ 创建WebSocket连接失败:', error)
      this.isConnecting = false
    }
  }

  /**
   * 断开WebSocket连接
   */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    this.stopHeartbeat()

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  /**
   * 发送消息
   */
  send(type, payload) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type, payload })
      this.ws.send(message)
      console.log('📤 发送WebSocket消息:', { type, payload })
    } else {
      console.warn('⚠️ WebSocket未连接，无法发送消息')
    }
  }

  /**
   * 订阅主题
   */
  subscribe(topics) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type: 'subscribe', topics })
      this.ws.send(message)
      console.log('📡 订阅主题:', topics)
    }
  }

  /**
   * 取消订阅主题
   */
  unsubscribe(topics) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const message = JSON.stringify({ type: 'unsubscribe', topics })
      this.ws.send(message)
      console.log('📡 取消订阅主题:', topics)
    }
  }

  /**
   * 添加事件监听器
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event).push(callback)
  }

  /**
   * 移除事件监听器
   */
  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event)
      const index = callbacks.indexOf(callback)
      if (index > -1) {
        callbacks.splice(index, 1)
      }
    }
  }

  /**
   * 触发事件
   */
  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => {
        try {
          callback(data)
        } catch (error) {
          console.error(`❌ WebSocket事件处理器错误 [${event}]:`, error)
        }
      })
    }
  }

  /**
   * 计划重连
   */
  scheduleReconnect() {
    this.reconnectAttempts++

    // 使用指数退避算法计算延迟时间
    const baseDelay = this.reconnectInterval
    const maxDelay = 30000 // 最大延迟30秒
    const delay = Math.min(baseDelay * Math.pow(2, this.reconnectAttempts - 1), maxDelay)

    console.log(`🔄 ${delay}ms后尝试第${this.reconnectAttempts}次重连...`)

    this.reconnectTimer = setTimeout(() => {
      console.log(`🔄 开始第${this.reconnectAttempts}次重连尝试`)
      this.connect()
    }, delay)
  }

  /**
   * 开始心跳
   */
  startHeartbeat() {
    this.stopHeartbeat()

    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.send('ping', { timestamp: Date.now() })
      }
    }, this.heartbeatInterval)
  }

  /**
   * 停止心跳
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * 获取连接状态
   */
  getReadyState() {
    return this.ws ? this.ws.readyState : WebSocket.CLOSED
  }

  /**
   * 是否已连接
   */
  isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN
  }
}

// 创建全局实例
const websocketService = new WebSocketService()

export default websocketService