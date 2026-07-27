const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
const port = 3005;

// 创建数据库连接池
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'iot_device_management',
  user: 'postgres',
  password: '123456'
});

// 中间件
app.use(cors());
app.use(express.json());

// 日志中间件
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// 创建照明设备定时
app.post('/api/lighting-timer', async (req, res) => {
  try {
    const { deviceId, action, time, repeat, enabled, name } = req.body;
    
    console.log('收到定时设置请求:', req.body);
    
    if (!deviceId || !action || !time) {
      return res.status(400).json({
        success: false,
        message: '缺少必要参数'
      });
    }
    
    const query = `
      INSERT INTO lighting_device_timers 
      (device_id, name, action, time, repeat, enabled)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      deviceId,
      name || `${deviceId} ${action === 'on' ? '开启' : '关闭'} ${time}`,
      action,
      time,
      repeat || [],
      enabled !== undefined ? enabled : true
    ]);
    
    if (result.rows.length > 0) {
      console.log(`创建照明设备定时成功: ${deviceId}, ${action}, ${time}`);
      return res.json({
        success: true,
        data: result.rows[0]
      });
    } else {
      throw new Error('创建定时失败');
    }
  } catch (error) {
    console.error('创建照明设备定时失败:', error);
    return res.status(500).json({
      success: false,
      message: `创建定时失败: ${error.message}`
    });
  }
});

// 获取照明设备定时列表
app.get('/api/lighting-timer/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return res.status(400).json({
        success: false,
        message: '缺少设备ID'
      });
    }
    
    const query = `
      SELECT * FROM lighting_device_timers
      WHERE device_id = $1
      ORDER BY time
    `;
    
    const result = await pool.query(query, [deviceId]);
    
    return res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('获取照明设备定时列表失败:', error);
    return res.status(500).json({
      success: false,
      message: `获取定时列表失败: ${error.message}`
    });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`定时功能服务器运行在 http://localhost:${port}`);
});