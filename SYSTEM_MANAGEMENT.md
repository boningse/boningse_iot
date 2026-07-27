# IoT系统管理脚本使用指南

本项目提供了多个脚本来管理IoT系统的启动、停止和监控。

## 脚本概览

### 1. `quick-start.sh` - 快速启动脚本

这是一个简化的快速启动脚本，专注于核心服务的快速启动和停止。

**功能特性：**
- 快速启动核心服务（后端服务）
- 简洁的状态显示
- 轻量级操作
- 适合日常开发使用

**使用方法：**
```bash
# 快速启动（默认操作）
./quick-start.sh
# 或
./quick-start.sh start

# 快速停止
./quick-start.sh stop

# 快速重启
./quick-start.sh restart

# 查看状态
./quick-start.sh status
```

### 3. 原有脚本

- `start_app.sh` - 原始的应用启动脚本（后端 + 前端开发服务器）
- `stop_app.sh` - 原始的应用停止脚本

## 推荐使用场景

### 开发环境
使用 `quick-start.sh` 进行日常开发：
```bash
# 开始工作
./quick-start.sh start

# 结束工作
./quick-start.sh stop
```

### 生产环境
使用 `quick-start.sh` 进行系统管理：
```bash
# 启动系统
./quick-start.sh start

# 监控系统状态
./quick-start.sh status

# 重启系统
./quick-start.sh restart
```

### 前端开发
如果需要前端热重载开发，使用原始脚本：
```bash
# 启动包含前端开发服务器
./start_app.sh

# 停止开发服务器
./stop_app.sh
```

## 系统架构

```
IoT系统组件:
├── 后端服务 (端口 3003) - Node.js API服务
├── PostgreSQL数据库 - 数据存储
├── Mosquitto MQTT - 消息队列
└── 前端应用 - Vue应用
```

## 访问地址

- **前端应用**: http://localhost:3000
- **后端API**: http://localhost:3003
- **健康检查**: http://localhost:3003/api/health

## 日志文件

系统运行日志存储在 `logs/` 目录下：
- `backend.log` - 后端服务日志
- `frontend.log` - 前端服务日志

## 故障排除

### 端口冲突
如果遇到端口占用问题：
```bash
# 检查端口占用
sudo netstat -tlnp | grep :3000
sudo netstat -tlnp | grep :3003

# 强制停止服务
./quick-start.sh stop
```

### 权限问题
确保脚本有执行权限：
```bash
chmod +x quick-start.sh
```

### 服务无法启动
检查系统状态和日志：
```bash
./quick-start.sh status
tail -f logs/backend.log
```

## 注意事项

1. **数据库连接**: 确保PostgreSQL服务正在运行
2. **防火墙**: 确保端口3000和3003未被防火墙阻止
3. **依赖检查**: 首次运行前确保所有依赖已安装

## 系统要求

- Linux操作系统
- Node.js >= 14.0
- PostgreSQL >= 12
- Mosquitto MQTT Broker