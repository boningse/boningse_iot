# IoT Device Management System

一个基于Vue.js和Node.js的物联网设备管理系统，支持设备监控、数据可视化、MQTT通信和实时WebSocket连接。

## 功能特性

- 🔐 用户认证和授权
- 📱 设备管理和监控
- 📊 实时数据可视化
- 🔌 MQTT协议支持
- 🌐 WebSocket实时通信
- 🏢 多租户支持
- 📈 数据统计和分析

## 技术栈

### 前端
- Vue.js 3
- Vite
- Element Plus
- ECharts
- Axios

### 后端
- Node.js
- Express.js
- Sequelize ORM
- PostgreSQL
- MQTT.js
- Socket.io
- JWT认证

### 基础设施
- Mosquitto MQTT Broker

## 快速开始

### 环境要求

- Node.js >= 16.0.0
- PostgreSQL >= 12
- MQTT Broker (推荐Mosquitto)

### 安装步骤

1. 克隆项目
```bash
git clone <repository-url>
cd iot
```

2. 安装依赖
```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

3. 配置环境变量
```bash
# 复制并编辑后端环境配置
cp backend/.env.example backend/.env

# 复制并编辑前端环境配置
cp frontend/.env.example frontend/.env
```

4. 初始化数据库
```bash
cd backend
# 数据库初始化脚本已删除
```

5. 启动服务
```bash
# 使用启动脚本
./start_app.sh

# 或者分别启动
# 启动后端
cd backend && npm start

# 启动前端
cd frontend && npm run dev
```



## 项目结构

```
iot/
├── backend/                 # 后端服务
│   ├── config/             # 配置文件
│   ├── middleware/         # 中间件
│   ├── models/             # 数据模型
│   ├── routes/             # 路由
│   ├── services/           # 服务层
│   ├── utils/              # 工具函数
│   └── sql/                # SQL脚本
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/     # 组件
│   │   ├── views/          # 页面
│   │   ├── api/            # API接口
│   │   └── utils/          # 工具函数
│   └── dist/               # 构建输出
├── database/               # 数据库脚本
├── mosquitto/              # MQTT配置
├── logs/                   # 日志文件

```

## API文档

完整接口清单、认证约定、权限范围、控制参数和微信小程序接入建议见：

- [伯宁云控 API 接口文档](docs/API_REFERENCE.md)

### 认证接口
- `POST /api/auth/login` - 用户登录
- `POST /api/auth/register` - 用户注册
- `GET /api/auth/check` - 检查认证状态

### 设备管理
- `GET /api/devices` - 获取设备列表
- `POST /api/devices` - 创建设备
- `PUT /api/devices/:id` - 更新设备
- `DELETE /api/devices/:id` - 删除设备

### 数据接口
- `GET /api/data/devices/:id` - 获取设备数据
- `GET /api/data/statistics` - 获取统计数据

## 配置说明

### 环境变量

#### 后端配置 (.env)
- `DB_HOST` - 数据库主机
- `DB_PORT` - 数据库端口
- `DB_NAME` - 数据库名称
- `DB_USER` - 数据库用户
- `DB_PASSWORD` - 数据库密码
- `JWT_SECRET` - JWT密钥
- `MQTT_BROKER_URL` - MQTT代理地址
- `ALLOWED_ORIGINS` - 允许的跨域来源

#### 前端配置 (.env)
- `VITE_API_BASE_URL` - 后端API地址
- `VITE_WS_URL` - WebSocket地址

## 部署指南

### 本地部署
使用 `./local-deploy.sh` 脚本进行本地部署。



### 生产环境部署
使用系统脚本进行部署配置。

## 开发工具

- `./dev-tools.sh` - 开发工具脚本
- `./status.sh` - 查看服务状态
- `./stop.sh` - 停止所有服务

## 贡献指南

1. Fork 项目
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开 Pull Request

## 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue
- 发送邮件

## 更新日志

### v1.0.0
- 初始版本发布
- 基础设备管理功能
- MQTT通信支持
- 实时数据可视化
