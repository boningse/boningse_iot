# IoT设备管理系统数据库迁移指南

## 概述

本指南提供了将IoT设备管理系统数据库从本地环境迁移到远程服务器 `192.168.10.139` 的完整解决方案。

## 迁移方案

我们提供了三种不同的迁移方案，您可以根据实际情况选择最适合的方案：

### 方案一：快速直连部署（推荐）

**适用场景**：网络直连，PostgreSQL客户端工具可直接访问远程数据库

**优点**：
- 操作简单，一键部署
- 实时传输，速度快
- 自动验证部署结果

**使用方法**：
```bash
./quick-deploy-db.sh
```

### 方案二：完整备份包部署

**适用场景**：网络受限，需要通过文件传输的方式部署

**优点**：
- 包含完整的部署包和说明文档
- 支持离线部署
- 提供多种恢复方式

**使用方法**：
```bash
./deploy-database-to-remote.sh
```

### 方案三：配置更新

**适用场景**：数据库已部署，只需要更新应用程序配置

**使用方法**：
```bash
./update-db-config.sh
```

## 详细操作步骤

### 准备工作

1. **确认远程服务器信息**
   - IP地址：`192.168.10.139`
   - PostgreSQL端口：`5432`
   - 数据库用户：`postgres`
   - 数据库密码：`123456`（请根据实际情况修改）

2. **检查网络连通性**
   ```bash
   ping 192.168.10.139
   telnet 192.168.10.139 5432
   ```

3. **确保远程服务器PostgreSQL配置**
   - PostgreSQL服务正在运行
   - 允许远程连接（修改 `postgresql.conf` 和 `pg_hba.conf`）
   - 防火墙开放5432端口

### 方案一：快速直连部署

#### 步骤1：执行快速部署脚本

```bash
# 进入项目目录
cd /home/ls/iot

# 执行快速部署
./quick-deploy-db.sh
```

#### 步骤2：更新应用程序配置

```bash
# 更新数据库配置
./update-db-config.sh
```

#### 步骤3：测试连接

```bash
# 测试数据库连接
node test-remote-db-connection.js
```

#### 步骤4：重启服务

```bash
# 重启后端服务
cd backend
npm start

# 或使用Docker
docker-compose down
docker-compose up -d
```

### 方案二：完整备份包部署

#### 步骤1：创建部署包

```bash
# 执行备份脚本
./deploy-database-to-remote.sh
```

这将创建一个包含以下文件的备份目录：
- `database_full_backup.dump` - PostgreSQL备份文件
- `database_full_backup.sql` - SQL格式备份文件
- `deploy_remote.sh` - 远程部署脚本
- `.env.remote` - 远程环境配置
- `sql/` - 数据库初始化脚本
- `README.md` - 详细说明文档

#### 步骤2：传输文件到远程服务器

```bash
# 使用scp传输
scp -r database_backup_* username@192.168.10.139:/tmp/

# 或使用rsync
rsync -avz database_backup_* username@192.168.10.139:/tmp/
```

#### 步骤3：在远程服务器执行部署

```bash
# 登录远程服务器
ssh username@192.168.10.139

# 进入备份目录
cd /tmp/database_backup_*

# 执行部署脚本
./deploy_remote.sh
```

#### 步骤4：更新本地配置

```bash
# 回到本地，更新配置
./update-db-config.sh
```

### 方案三：仅更新配置

如果数据库已经部署完成，只需要更新应用程序配置：

```bash
# 更新数据库配置
./update-db-config.sh

# 测试连接
node test-remote-db-connection.js
```

## 数据库结构说明

### 主要数据表

1. **tenants** - 租户表
   - 存储企业/组织信息
   - 支持多租户架构

2. **users** - 用户表
   - 系统用户信息
   - 角色权限管理

3. **device_types** - 设备类型表
   - 设备类型定义
   - 数据格式和命令格式

4. **devices** - 设备表
   - 设备基本信息
   - 状态和配置

5. **device_data** - 设备数据表
   - 设备上报的实时数据
   - 时序数据存储

6. **device_logs** - 设备日志表
   - 设备操作日志
   - 错误和事件记录

### 默认数据

系统包含以下默认数据：
- 默认租户和演示企业
- 管理员用户（用户名：admin，密码：123456）
- 4种设备类型（温湿度传感器、智能电表、水质监测仪、智能摄像头）
- 5个演示设备
- 告警规则配置
- 系统配置参数

## 配置文件说明

### 后端配置文件 (backend/.env)

```env
# 数据库配置
DB_HOST=192.168.10.139
DB_PORT=5432
DB_NAME=iot_device_management
DB_USER=postgres
DB_PASSWORD=123456

# 其他配置...
```

### Docker配置文件 (.env.docker)

用于Docker部署时的环境变量配置。

## 验证部署

### 1. 数据库连接验证

```bash
# 使用psql客户端
psql -h 192.168.10.139 -U postgres -d iot_device_management

# 使用测试脚本
node test-remote-db-connection.js
```

### 2. 数据完整性验证

```sql
-- 检查表结构
\dt

-- 检查数据统计
SELECT 
    'tenants' as table_name, count(*) as record_count 
FROM tenants 
UNION ALL 
SELECT 'users', count(*) FROM users 
UNION ALL 
SELECT 'devices', count(*) FROM devices 
UNION ALL 
SELECT 'device_types', count(*) FROM device_types;
```

### 3. 应用程序验证

```bash
# 启动后端服务
cd backend
npm start

# 启动前端服务
npm run dev

# 访问系统
# 前端：http://localhost:3001
# 后端API：http://localhost:3003
```

## 故障排除

### 常见问题

1. **连接被拒绝**
   - 检查PostgreSQL服务状态
   - 检查防火墙设置
   - 验证pg_hba.conf配置

2. **权限错误**
   - 确认数据库用户权限
   - 检查密码是否正确

3. **网络超时**
   - 检查网络连通性
   - 验证端口是否开放

4. **备份恢复失败**
   - 尝试使用SQL文件恢复
   - 检查PostgreSQL版本兼容性

### 日志查看

```bash
# PostgreSQL日志
sudo tail -f /var/log/postgresql/postgresql-*.log

# 应用程序日志
tail -f backend/logs/app.log
```

## 安全建议

1. **修改默认密码**
   - 数据库用户密码
   - 应用程序管理员密码

2. **网络安全**
   - 配置防火墙规则
   - 使用VPN或专网连接

3. **数据备份**
   - 定期备份数据库
   - 测试备份恢复流程

4. **监控告警**
   - 配置数据库监控
   - 设置异常告警

## 联系支持

如果在迁移过程中遇到问题，请：

1. 查看相关日志文件
2. 检查网络和服务状态
3. 参考故障排除章节
4. 保存错误信息以便技术支持

---

**注意**：在生产环境中部署前，请务必在测试环境中验证整个迁移流程。