# API配置备忘录

## 重要提醒 ⚠️

**用户明确要求：API地址必须使用 `https://mqttapi.boningse.com`**

- 前端API基础URL：`https://mqttapi.boningse.com/api`
- WebSocket URL：`wss://mqttapi.boningse.com/ws`  
- MQTT URL：`wss://mqttapi.boningse.com/mqtt`

## 注意事项

1. **不要将API地址改为本地地址**（如 localhost:3003）
2. 用户已多次强调必须使用生产环境地址
3. 所有API调用都应指向 mqttapi.boningse.com 域名
4. 使用HTTPS/WSS协议，不要使用HTTP/WS

## 配置文件位置

- 前端环境配置：`/mnt/mydisk/iot/frontend/.env`
- API配置文件：`/mnt/mydisk/iot/frontend/src/api/index.js`

## 最后更新

2025-01-17 - 用户再次强调必须使用生产环境API地址