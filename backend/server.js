const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(helmet());
app.use(compression());
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 基础路由
app.get('/', (req, res) => {
  res.json({ 
    message: 'IoT设备管理系统后端API',
    version: '1.0.0',
    status: 'running'
  });
});

// 设备管理路由
app.get('/api/devices', (req, res) => {
  res.json({
    devices: [
      { id: 1, name: '温度传感器1', type: 'temperature', status: 'online' },
      { id: 2, name: '湿度传感器1', type: 'humidity', status: 'online' },
      { id: 3, name: '电表1', type: 'meter', status: 'offline' }
    ]
  });
});

// 数据路由
app.get('/api/data', (req, res) => {
  res.json({
    data: [
      { timestamp: new Date(), device_id: 1, value: 25.5, unit: '°C' },
      { timestamp: new Date(), device_id: 2, value: 60, unit: '%' }
    ]
  });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date() });
});

// 错误处理
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: '服务器内部错误' });
});

// 404处理
app.use((req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`IoT后端服务已启动，端口: ${PORT}`);
  console.log(`访问地址: http://localhost:${PORT}`);
});

module.exports = app;