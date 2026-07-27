const http = require('http');
const url = require('url');

const PORT = 8080; // 改用8080端口

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const origin = req.headers.origin;
  
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${origin}`);
  
  // 允许的域名列表
  const allowedOrigins = [
    'http://192.168.10.139:3000',
    'http://192.168.10.139:3001',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  
  // 设置CORS头部
  if (allowedOrigins.includes(origin) || !origin) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    console.log('CORS允许:', origin);
  } else {
    console.log('CORS拒绝:', origin);
  }
  
  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  // 处理登录请求
  if (req.method === 'POST' && parsedUrl.pathname === '/api/auth/login') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    
    req.on('end', () => {
      console.log('登录请求体:', body);
      
      res.setHeader('Content-Type', 'application/json');
      res.writeHead(200);
      res.end(JSON.stringify({
        success: true,
        message: 'CORS测试成功 - 登录请求已处理',
        data: {
          token: 'test-token-' + Date.now(),
          user: { username: 'test' }
        },
        origin: origin
      }));
    });
    return;
  }
  
  // 健康检查
  if (req.method === 'GET' && parsedUrl.pathname === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.writeHead(200);
    res.end(JSON.stringify({
      status: 'OK',
      message: '简单CORS测试服务器运行中',
      timestamp: new Date().toISOString()
    }));
    return;
  }
  
  // 404
  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`简单CORS测试服务器启动成功，端口: ${PORT}`);
  console.log(`健康检查: http://localhost:${PORT}/health`);
  console.log(`登录接口: http://localhost:${PORT}/api/auth/login`);
});

server.on('error', (err) => {
  console.error('服务器错误:', err);
});