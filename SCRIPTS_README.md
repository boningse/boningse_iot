# IoT 设备管理系统运行脚本说明

本项目提供了一套完整的运行和管理脚本，帮助您轻松启动、停止和管理 IoT 设备管理系统。

## 脚本概览

| 脚本名称 | 功能描述 | 推荐使用场景 |
|---------|---------|-------------|
| `run.sh` | 新版启动脚本 | 生产环境和开发环境的标准启动 |
| `stop.sh` | 新版停止脚本 | 优雅停止和强制停止服务 |
| `status.sh` | 状态检查脚本 | 监控系统运行状态 |
| `dev-tools.sh` | 开发工具脚本 | 开发和维护任务 |
| `start_app.sh` | 原版启动脚本 | 简单快速启动（兼容性） |
| `stop_app.sh` | 原版停止脚本 | 简单快速停止（兼容性） |

## 详细使用说明

### 1. 启动系统 - `run.sh`

**新版启动脚本，功能更强大，推荐使用**

```bash
# 基本启动（开发环境）
./run.sh

# 生产环境启动
./run.sh --env production

# 使用 Docker 启动
./run.sh --docker

# 跳过依赖安装
./run.sh --skip-deps

# 跳过数据库初始化
./run.sh --skip-db-init

# 自定义端口
./run.sh --frontend-port 8080 --backend-port 8081

# 查看帮助
./run.sh --help
```

**功能特性：**
- ✅ 环境检查（Node.js 版本、端口占用等）
- ✅ 自动安装依赖
- ✅ 自动创建环境配置文件
- ✅ 数据库初始化
- ✅ 支持开发和生产环境
- ✅ 支持 Docker 部署
- ✅ 详细的状态信息显示

### 2. 停止系统 - `stop.sh`

**新版停止脚本，支持优雅停止和强制停止**

```bash
# 优雅停止
./stop.sh

# 强制停止
./stop.sh --force

# 停止 Docker 服务
./stop.sh --docker

# 自定义等待时间
./stop.sh --wait 15

# 查看帮助
./stop.sh --help
```

**功能特性：**
- ✅ 优雅停止进程（SIGTERM）
- ✅ 强制停止选项（SIGKILL）
- ✅ 自动清理 PID 文件
- ✅ 检查剩余进程
- ✅ 支持 Docker 环境

### 3. 状态检查 - `status.sh`

**系统状态监控脚本**

```bash
# 基本状态检查
./status.sh

# 显示详细信息
./status.sh --detailed

# 显示最近日志
./status.sh --logs

# 检查 Docker 状态
./status.sh --docker

# 自定义日志行数
./status.sh --logs --log-lines 50
```

**功能特性：**
- ✅ 服务运行状态检查
- ✅ 端口占用情况
- ✅ 系统资源使用情况
- ✅ 网络连接状态
- ✅ 配置文件检查
- ✅ 实时日志显示
- ✅ 访问地址信息

### 4. 开发工具 - `dev-tools.sh`

**开发和维护工具集合**

```bash
# 安装所有依赖
./dev-tools.sh install

# 清理项目
./dev-tools.sh clean
./dev-tools.sh clean --force  # 强制清理（包括 node_modules）

# 构建前端
./dev-tools.sh build

# 运行测试
./dev-tools.sh test

# 代码检查
./dev-tools.sh lint

# 数据库操作
./dev-tools.sh db-init        # 初始化数据库
./dev-tools.sh db-reset       # 重置数据库
./dev-tools.sh db-backup      # 备份数据库
./dev-tools.sh db-restore backup.sql  # 恢复数据库

# 日志和监控
./dev-tools.sh logs           # 实时查看日志
./dev-tools.sh monitor        # 系统状态监控

# 维护操作
./dev-tools.sh update         # 更新依赖
./dev-tools.sh security-check # 安全检查
./dev-tools.sh performance-test # 性能测试

# SSL 证书
./dev-tools.sh generate-ssl   # 生成自签名SSL证书

# 备份和恢复
./dev-tools.sh backup         # 备份整个项目
./dev-tools.sh restore backup.tar.gz  # 恢复项目

# 查看所有命令
./dev-tools.sh --help
```

### 5. 原版脚本（兼容性）

**简单快速的启动停止脚本**

```bash
# 启动系统
./start_app.sh

# 停止系统
./stop_app.sh
```

## 推荐工作流程

### 首次部署

```bash
# 1. 安装依赖和初始化
./dev-tools.sh install

# 2. 初始化数据库
./dev-tools.sh db-init

# 3. 启动系统
./run.sh

# 4. 检查状态
./status.sh --detailed
```

### 日常开发

```bash
# 启动开发环境
./run.sh

# 查看实时日志
./dev-tools.sh logs

# 运行测试
./dev-tools.sh test

# 代码检查
./dev-tools.sh lint

# 停止服务
./stop.sh
```

### 生产部署

```bash
# 1. 清理和构建
./dev-tools.sh clean
./dev-tools.sh install
./dev-tools.sh build

# 2. 安全检查
./dev-tools.sh security-check

# 3. 备份数据库
./dev-tools.sh db-backup

# 4. 启动生产环境
./run.sh --env production

# 5. 监控状态
./status.sh --detailed
```

### 故障排除

```bash
# 检查系统状态
./status.sh --detailed --logs

# 强制停止所有服务
./stop.sh --force

# 清理并重新启动
./dev-tools.sh clean
./run.sh

# 重置数据库（谨慎使用）
./dev-tools.sh db-reset --force
```

## 环境变量配置

脚本会自动创建环境配置文件，您也可以手动修改：

### 后端配置 (`backend/.env`)

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_device_management
DB_USER=postgres
DB_PASSWORD=123456

# 服务器配置
PORT=3003
NODE_ENV=development

# JWT 配置
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=24h

# MQTT 配置
MQTT_BROKER_URL=mqtt://localhost:1883
```

### 前端配置 (`frontend/.env`)

```env
# API 配置
VITE_API_BASE_URL=http://localhost:3003
VITE_WS_URL=ws://localhost:3003

# 应用配置
VITE_APP_TITLE=IoT设备管理系统
VITE_APP_VERSION=1.0.0
```

## 日志文件位置

- 后端日志: `logs/backend.log`
- 前端日志: `logs/frontend.log`
- 应用日志: `logs/app.log`
- PID 文件: `logs/*.pid`

## 备份文件位置

- 数据库备份: `backups/db_backup_*.sql`
- 项目备份: `backups/project_backup_*.tar.gz`

## 常见问题

### Q: 端口被占用怎么办？
A: 使用自定义端口启动：`./run.sh --frontend-port 8080 --backend-port 8081`

### Q: 如何查看详细的错误信息？
A: 使用详细模式：`./status.sh --detailed --logs`

### Q: 如何完全重置系统？
A: 执行以下命令：
```bash
./stop.sh --force
./dev-tools.sh clean --force
./dev-tools.sh db-reset --force
./run.sh
```

### Q: 如何在生产环境中使用？
A: 使用生产模式启动：`./run.sh --env production`

### Q: 如何备份和恢复数据？
A: 
```bash
# 备份
./dev-tools.sh db-backup
./dev-tools.sh backup

# 恢复
./dev-tools.sh db-restore backup.sql
./dev-tools.sh restore backup.tar.gz
```

## 脚本特性对比

| 特性 | run.sh | start_app.sh |
|------|--------|-------------|
| 环境检查 | ✅ | ❌ |
| 依赖安装 | ✅ | ❌ |
| 配置文件创建 | ✅ | ❌ |
| 数据库初始化 | ✅ | ❌ |
| 多环境支持 | ✅ | ❌ |
| Docker 支持 | ✅ | ❌ |
| 详细日志 | ✅ | ✅ |
| 简单易用 | ✅ | ✅ |

## 技术支持

如果您在使用脚本过程中遇到问题，请：

1. 首先运行 `./status.sh --detailed --logs` 查看详细状态
2. 检查日志文件中的错误信息
3. 尝试使用 `./dev-tools.sh clean` 清理后重新启动
4. 查看本文档的常见问题部分

---

**推荐使用新版脚本（`run.sh`、`stop.sh`、`status.sh`、`dev-tools.sh`）以获得最佳体验！**