/**
 * 前端WebSocket连接测试脚本
 * 模拟前端页面的WebSocket连接行为
 */

const WebSocket = require('ws');

// 使用从后端获取的有效token
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsInVzZXJuYW1lIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4iLCJpYXQiOjE3MzMyNzk5NzIsImV4cCI6MTczMzM2NjM3Mn0.Ej5Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8Ej8';

// WebSocket连接URL
const wsUrl = `ws://localhost:3003/ws?token=${encodeURIComponent(token)}`;

console.log('🔌 开始测试前端WebSocket连接...');
console.log('连接URL:', wsUrl);

const ws = new WebSocket(wsUrl);

ws.on('open', function open() {
  console.log('✅ WebSocket连接已建立');
  
  // 订阅设备相关主题
  const subscribeMessage = {
    type: 'subscribe',
    topics: [
      'device_status_update',
      'device_data',
      'device_response',
      'device_event'
    ]
  };
  
  console.log('📡 发送订阅消息:', subscribeMessage);
  ws.send(JSON.stringify(subscribeMessage));
});

ws.on('message', function message(data) {
  try {
    const parsedData = JSON.parse(data);
    console.log('📨 收到WebSocket消息:', {
      type: parsedData.type,
      timestamp: new Date().toLocaleTimeString(),
      data: parsedData
    });
    
    // 特别关注设备数据消息
    if (parsedData.type === 'device_data' || parsedData.type === 'data') {
      console.log('🎯 设备数据详情:', {
        deviceId: parsedData.deviceId || parsedData.device_id,
        payload: parsedData.payload,
        messageType: parsedData.messageType,
        dataSize: parsedData.dataSize
      });
    }
  } catch (error) {
    console.error('❌ 解析消息失败:', error);
    console.log('原始消息:', data.toString());
  }
});

ws.on('error', function error(err) {
  console.error('❌ WebSocket错误:', err);
});

ws.on('close', function close(code, reason) {
  console.log('🔌 WebSocket连接已关闭');
  console.log('关闭代码:', code);
  console.log('关闭原因:', reason.toString());
});

// 保持脚本运行
console.log('⏳ 等待WebSocket消息...');
console.log('按 Ctrl+C 停止测试');

// 优雅退出处理
process.on('SIGINT', () => {
  console.log('\n🛑 收到退出信号，正在关闭WebSocket连接...');
  ws.close();
  process.exit(0);
});