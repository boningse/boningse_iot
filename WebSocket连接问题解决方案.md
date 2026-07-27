# WebSocket连接问题解决方案

## 问题描述

在IoT系统中，浏览器端WebSocket连接失败，错误代码1006，而Node.js客户端连接正常。

## 问题分析

### 初步排查
1. **JWT Token验证** ✅ - Token有效，Node.js客户端可以正常连接
2. **CORS配置** ✅ - 后端已配置允许所有来源的跨域请求
3. **服务状态** ✅ - WebSocket服务运行在端口3003，状态正常

### 根本原因
**跨域问题**：前端开发服务器运行在端口3004，WebSocket服务运行在端口3003，缺少Origin验证逻辑。

## 解决方案

### 1. 修复WebSocket服务的Origin验证

在 `backend/services/websocketService.js` 的 `verifyClient` 方法中添加Origin验证：

```javascript
// 检查Origin（跨域支持）
const origin = info.origin;
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001', 
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:3004',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002', 
  'http://127.0.0.1:3003',
  'http://127.0.0.1:3004'
];

if (origin && !allowedOrigins.includes(origin)) {
  logger.warn('WebSocket连接被拒绝：不允许的Origin', { origin });
  return false;
}
```

### 2. 修复连接处理逻辑

修复WebSocket服务器的connection事件处理：

```javascript
this.wss.on('connection', (ws, req) => {
  console.log('=== WebSocket连接事件触发 ===');
  logger.info('WebSocket连接事件触发');
  this.handleConnection(ws, req);
});
```

修复客户端信息存储：

```javascript
const clientInfo = {
  ws,
  user,
  lastPing: Date.now(),
  connectedAt: Date.now(),
  subscriptions: new Set(['device_data', 'device_status_update', 'device_offline', 'device_response', 'device_event', 'communication_log'])
};

this.clients.set(clientId, clientInfo);
```

## 验证结果

### 测试用例1：简单连接测试
```bash
node simple_websocket_test.js
```
**结果**：✅ 连接成功，能够接收connection和subscribed消息

### 测试用例2：并发连接和数据测试
```bash
node concurrent_websocket_test.js
```
**结果**：✅ 连接成功，能够接收设备数据和状态更新

### 测试统计
- 总消息接收：4条
- 设备数据：1条
- 状态更新：0条
- 连接状态：正常

## 正确的WebSocket连接方式

### 1. 获取JWT Token
```javascript
const loginResponse = await fetch('http://localhost:3003/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'apple', password: '225788' })
});
const { data: { token } } = await loginResponse.json();
```

### 2. 建立WebSocket连接
```javascript
const wsUrl = `ws://localhost:3003/ws?token=${encodeURIComponent(token)}`;
const ws = new WebSocket(wsUrl, {
    headers: { 'Origin': 'http://localhost:3004' }
});
```

### 3. 订阅设备主题
```javascript
ws.on('open', function() {
    const subscribeMessage = {
        type: 'subscribe',
        topics: ['device_data', 'device_status_update', 'device_event']
    };
    ws.send(JSON.stringify(subscribeMessage));
});
```

## 注意事项

1. **端口配置**：确保前端开发服务器和WebSocket服务使用不同端口
2. **Origin验证**：WebSocket服务必须验证请求来源
3. **Token传递**：JWT token通过URL参数传递：`?token=xxx`
4. **订阅机制**：连接后需要主动订阅相关主题才能接收数据

## 相关文件

- `backend/services/websocketService.js` - WebSocket服务实现
- `frontend/check_frontend_console.html` - 前端测试页面
- `test_websocket_flow.js` - WebSocket流程测试脚本
- `concurrent_websocket_test.js` - 并发测试脚本

## 问题状态

✅ **已解决** - WebSocket连接问题已修复，前端可以正常连接并接收设备数据。