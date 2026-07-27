# IoT系统进程管理指南

本文档介绍如何使用IoT系统的进程管理功能，包括启动、停止、监控和自动重启等功能。

## 脚本概览

### 1. manage.sh - 主要管理脚本
完整的进程管理功能，包括启动、停止、监控、健康检查等。

### 2. daemon.sh - 守护进程脚本
监控和自动重启IoT系统服务，确保系统长期稳定运行。

### 3. autostart.sh - 自动启动脚本
系统启动时自动启动IoT服务。

### 4. iot-system.service - 系统服务配置
Systemd服务配置文件，可将IoT系统注册为系统服务。

## 快速开始

### 基本使用

```bash
# 启动IoT系统
./manage.sh start

# 停止IoT系统
./manage.sh stop

# 重启IoT系统
./manage.sh restart

# 查看系统状态
./manage.sh status

# 健康检查
./manage.sh health
```

### 系统服务模式

```bash
# 安装为系统服务 (需要sudo)
sudo ./manage.sh install

# 使用systemctl管理
sudo systemctl start iot-system
sudo systemctl stop iot-system
sudo systemctl status iot-system
sudo systemctl restart iot-system

# 卸载系统服务
sudo ./manage.sh uninstall
```

### 自动启动设置

```bash
# 安装自动启动 (系统重启后自动启动)
sudo ./autostart.sh install

# 卸载自动启动
sudo ./autostart.sh uninstall
```

## 详细功能

### 1. 进程管理 (manage.sh)

#### 基本命令
- `start` - 启动IoT系统
- `stop` - 停止IoT系统
- `restart` - 重启IoT系统
- `status` - 查看系统状态
- `health` - 健康检查
- `monitor` - 性能监控

#### 服务管理
- `install` - 安装为系统服务 (需要sudo)
- `uninstall` - 卸载系统服务 (需要sudo)

#### 日志管理
- `logs [类型]` - 查看日志
  - `backend` - 后端服务日志
  - `frontend` - 前端服务日志
  - `daemon` - 守护进程日志
  - `system` - 系统服务日志
  - `all` - 显示所有可用日志类型
- `clean` - 清理旧日志文件

#### 维护命令
- `backup` - 备份配置文件
- `help` - 显示帮助信息

### 2. 守护进程 (daemon.sh)

#### 功能特性
- 自动监控后端和前端服务
- 服务异常时自动重启
- 健康检查和故障恢复
- 详细的日志记录
- 资源使用监控

#### 使用方法
```bash
# 启动守护进程
./daemon.sh start

# 停止守护进程
./daemon.sh stop

# 查看守护进程状态
./daemon.sh status

# 查看守护进程日志
./daemon.sh logs

# 重启守护进程
./daemon.sh restart
```

#### 配置参数
- 监控间隔：30秒
- 重启延迟：10秒
- 最大重启次数：5次/小时
- 健康检查超时：10秒

### 3. 自动启动 (autostart.sh)

#### 功能特性
- 系统启动时自动启动IoT服务
- 等待网络和依赖服务就绪
- 详细的启动日志记录
- 失败时的错误处理

#### 依赖检查
- 网络连接检查
- Redis服务检查
- 数据库服务检查

### 4. 系统服务 (iot-system.service)

#### 服务特性
- 自动重启策略
- 资源限制配置
- 日志输出配置
- 依赖服务管理

#### 配置说明
- 重启策略：always
- 重启延迟：10秒
- 启动超时：60秒
- 停止超时：30秒

## 日志管理

### 日志文件位置
- 后端日志：`logs/backend.log`
- 前端日志：`logs/frontend.log`
- 守护进程日志：`logs/daemon.log`
- 自动启动日志：`logs/autostart.log`
- 系统服务日志：通过 `journalctl -u iot-system` 查看

### 日志清理
```bash
# 清理超过7天的日志文件
./manage.sh clean

# 手动清理
find logs/ -name "*.log" -mtime +7 -delete
```

## 监控和维护

### 健康检查
```bash
# 完整健康检查
./manage.sh health

# 检查项目包括：
# - 后端服务响应
# - 前端服务响应
# - Redis连接
# - 数据库连接
```

### 性能监控
```bash
# 查看系统性能
./manage.sh monitor

# 监控内容包括：
# - CPU和内存使用
# - 进程信息
# - 网络连接
# - 磁盘使用
```

### 配置备份
```bash
# 备份当前配置
./manage.sh backup

# 备份内容包括：
# - 环境配置文件 (.env)
# - 脚本文件 (*.sh)
# - 服务配置文件 (*.service)
```

## 故障排除

### 常见问题

1. **服务启动失败**
   ```bash
   # 查看详细状态
   ./manage.sh status
   
   # 查看日志
   ./manage.sh logs backend
   ./manage.sh logs frontend
   ```

2. **端口被占用**
   ```bash
   # 检查端口使用
   netstat -tlnp | grep -E ':(3000|3003)'
   
   # 杀死占用进程
   sudo kill -9 <PID>
   ```

3. **Redis连接失败**
   ```bash
   # 检查Redis服务
   redis-cli ping
   
   # 检查Redis配置
   cat backend/.env | grep REDIS
   ```

4. **数据库连接失败**
   ```bash
   # 测试数据库连接
   cd backend && node -e "require('./utils/database.js').testConnection()"
   ```

### 紧急恢复

```bash
# 强制停止所有服务
./manage.sh stop
pkill -f "node.*backend"
pkill -f "node.*frontend"

# 清理PID文件
rm -f pids/*.pid

# 重新启动
./manage.sh start
```

## 最佳实践

1. **生产环境建议**
   - 使用系统服务模式：`sudo ./manage.sh install`
   - 启用自动启动：`sudo ./autostart.sh install`
   - 定期备份配置：`./manage.sh backup`
   - 监控日志大小：`./manage.sh clean`

2. **开发环境建议**
   - 使用脚本模式：`./manage.sh start/stop`
   - 启用守护进程：`./daemon.sh start`
   - 实时查看日志：`./manage.sh logs backend`

3. **维护建议**
   - 定期健康检查：`./manage.sh health`
   - 监控系统性能：`./manage.sh monitor`
   - 及时清理日志：`./manage.sh clean`

## 安全注意事项

1. **权限管理**
   - 脚本文件应设置适当的执行权限
   - 系统服务安装需要root权限
   - 日志文件应限制访问权限

2. **网络安全**
   - 确保防火墙配置正确
   - 限制服务端口的外部访问
   - 使用强密码保护Redis和数据库

3. **数据安全**
   - 定期备份重要数据
   - 保护环境配置文件中的敏感信息
   - 监控异常访问和操作

## 支持和帮助

如果遇到问题，请：

1. 查看相关日志文件
2. 运行健康检查：`./manage.sh health`
3. 查看系统状态：`./manage.sh status`
4. 参考故障排除部分

更多帮助信息：
```bash
./manage.sh help
./daemon.sh help
./autostart.sh help
```