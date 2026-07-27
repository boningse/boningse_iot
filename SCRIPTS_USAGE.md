# IoT系统脚本使用说明

本文档介绍IoT系统中各个脚本的使用方法和功能。

## 脚本概览

### 1. quick-start.sh - 主启动脚本
**功能**: 管理IoT系统的启动、停止、重启和状态检查

**使用方法**:
```bash
# 启动系统
./quick-start.sh start

# 停止系统
./quick-start.sh stop

# 重启系统
./quick-start.sh restart

# 检查状态
./quick-start.sh status
```

**特性**:
- 自动创建必要的目录（logs, pids）
- 彩色输出，便于识别状态
- PID文件管理，避免重复启动
- 详细的日志记录
- 端口占用检查
- 进程健康检查

### 2. stop.sh - 快速停止脚本
**功能**: 快速停止所有IoT系统服务

**使用方法**:
```bash
./stop.sh
```

**特性**:
- 优雅停止所有服务
- 强制清理残留进程
- 端口释放状态检查
- 彩色状态输出

### 3. status.sh - 系统状态检查脚本
**功能**: 详细显示IoT系统的运行状态

**使用方法**:
```bash
./status.sh
```

**显示信息**:
- 服务运行状态（PID、运行时间、内存使用）
- 端口监听状态
- 服务健康检查
- 访问地址
- 日志文件状态
- 系统资源使用情况
- 快速操作提示

## 系统架构

### 服务组件
- **前端服务**: Vue.js开发服务器，运行在端口3000
- **后端服务**: Node.js API服务器，运行在端口3003

### 访问地址
- 前端应用: http://localhost:3000
- 后端API: http://localhost:3003
- 健康检查: http://localhost:3003/health

### 文件结构
```
/mnt/mydisk/iot/
├── quick-start.sh      # 主启动脚本
├── stop.sh            # 快速停止脚本
├── status.sh          # 状态检查脚本
├── logs/              # 日志目录
│   ├── backend.log    # 后端日志
│   └── frontend.log   # 前端日志
├── pids/              # PID文件目录
│   ├── backend.pid    # 后端进程PID
│   └── frontend.pid   # 前端进程PID
├── backend/           # 后端代码
└── frontend/          # 前端代码
```

## 常用操作

### 开发环境启动
```bash
# 启动开发环境
./quick-start.sh start

# 查看状态
./status.sh

# 查看日志
tail -f logs/backend.log
tail -f logs/frontend.log
```

### 生产环境部署
```bash
# 启动生产环境
NODE_ENV=production ./quick-start.sh start

# 检查状态
./status.sh
```

### 故障排除
```bash
# 检查系统状态
./status.sh

# 重启系统
./quick-start.sh restart

# 强制停止
./stop.sh

# 查看错误日志
grep -i error logs/backend.log
grep -i error logs/frontend.log
```

## 注意事项

1. **权限**: 确保脚本有执行权限
   ```bash
   chmod +x *.sh
   ```

2. **端口冲突**: 启动前确保端口3000和3003未被占用
   ```bash
   netstat -tlnp | grep -E ':3000|:3003'
   ```

3. **依赖检查**: 确保Node.js和npm已安装
   ```bash
   node --version
   npm --version
   ```

4. **环境变量**: 检查.env文件配置是否正确

5. **数据库连接**: 确保PostgreSQL服务正在运行

6. **MQTT服务**: 确保Mosquitto MQTT服务正在运行

## 脚本特性

### 安全特性
- PID文件管理，防止重复启动
- 进程存活检查
- 优雅关闭处理
- 错误处理和日志记录

### 用户体验
- 彩色输出，状态一目了然
- 详细的进度提示
- 清晰的错误信息
- 快速操作提示

### 监控功能
- 实时状态检查
- 资源使用监控
- 日志文件管理
- 健康检查端点

## 扩展说明

如需添加新的服务或修改配置，可以编辑相应的脚本文件。所有脚本都采用模块化设计，便于维护和扩展。