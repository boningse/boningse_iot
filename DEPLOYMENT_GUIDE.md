# IoT系统远程部署指南

本指南详细说明如何将IoT设备管理系统部署到远程服务器 `111.15.177.66`。

## 📋 部署信息

- **目标服务器**: 111.15.177.66
- **用户名**: bnse
- **密码**: 225788
- **部署路径**: /home/bnse/iot
- **前端端口**: 3001
- **后端端口**: 3003
- **数据库**: PostgreSQL (端口5432)

## 🚀 快速部署（推荐）

### 方法一：一键部署

```bash
# 确保本地环境已安装必要工具
sudo apt-get install sshpass rsync postgresql-client

# 执行快速部署
./quick-deploy.sh deploy
```

### 方法二：分步部署

```bash
# 1. 设置远程数据库
./setup-remote-database.sh setup

# 2. 部署应用代码
./quick-deploy.sh deploy

# 3. 验证部署结果
./quick-deploy.sh verify
```

## 📦 完整部署包方式

如果需要创建完整的部署包：

```bash
# 创建完整部署包
./deploy-to-remote.sh

# 或者仅验证部署结果
./deploy-to-remote.sh --verify-only
```

## 🔧 手动部署步骤

### 1. 准备本地环境

```bash
# 安装必要工具
sudo apt-get update
sudo apt-get install sshpass rsync postgresql-client

# 检查工具是否安装成功
sshpass -V
rsync --version
pg_dump --version
```

### 2. 设置远程服务器环境

```bash
# 连接到远程服务器
ssh bnse@111.15.177.66

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 安装PM2（可选，用于进程管理）
sudo npm install -g pm2
```

### 3. 配置PostgreSQL数据库

```bash
# 在远程服务器上执行
sudo -u postgres psql

-- 在PostgreSQL命令行中执行
ALTER USER postgres PASSWORD '123456';
CREATE DATABASE iot_device_management;
\q

# 配置PostgreSQL认证
sudo nano /etc/postgresql/*/main/pg_hba.conf
# 将 peer 改为 md5

# 重启PostgreSQL
sudo systemctl restart postgresql
```

### 4. 同步代码到远程服务器

```bash
# 在本地项目目录执行
rsync -avz --delete \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='logs' \
    --exclude='*.log' \
    -e "ssh" \
    ./ bnse@111.15.177.66:/home/bnse/iot/
```

### 5. 在远程服务器部署

```bash
# 连接到远程服务器
ssh bnse@111.15.177.66
cd /home/bnse/iot

# 创建生产环境配置
cp backend/.env.example backend/.env
nano backend/.env  # 修改数据库配置

# 安装依赖
cd backend && npm install --production
cd ../frontend && npm install && npm run build

# 启动服务
cd ..
./quick-start.sh start
```

## 🔍 验证部署

### 检查服务状态

```bash
# 本地检查
./quick-deploy.sh verify

# 或者远程检查
ssh bnse@111.15.177.66 'cd /home/bnse/iot && ./quick-start.sh status'
```

### 访问系统

- **前端界面**: http://111.15.177.66:3001
- **后端API**: http://111.15.177.66:3003
- **API健康检查**: http://111.15.177.66:3003/api/health

### 测试API接口

```bash
# 测试后端API
curl http://111.15.177.66:3003/api/health

# 测试前端页面
curl -I http://111.15.177.66:3001
```

## 🛠️ 管理命令

### 本地管理命令

```bash
# 同步代码
./quick-deploy.sh sync

# 查看远程日志
./quick-deploy.sh logs

# 重启远程服务
./quick-deploy.sh restart

# 停止远程服务
./quick-deploy.sh stop
```

### 远程管理命令

```bash
# 连接到远程服务器
ssh bnse@111.15.177.66
cd /home/bnse/iot

# 查看服务状态
./quick-start.sh status

# 重启服务
./quick-start.sh restart

# 查看日志
tail -f logs/backend.log
tail -f logs/frontend.log

# 使用PM2管理（如果安装了PM2）
pm2 status
pm2 logs
pm2 restart all
```

## 📊 数据库管理

### 备份数据库

```bash
# 在远程服务器上备份
PGPASSWORD=123456 pg_dump -h localhost -U postgres iot_device_management > backup.sql

# 下载备份到本地
scp bnse@111.15.177.66:/home/bnse/backup.sql ./
```

### 恢复数据库

```bash
# 上传备份文件
scp backup.sql bnse@111.15.177.66:/home/bnse/

# 在远程服务器恢复
ssh bnse@111.15.177.66
PGPASSWORD=123456 psql -h localhost -U postgres iot_device_management < backup.sql
```

### 查看数据库状态

```bash
# 连接数据库
PGPASSWORD=123456 psql -h localhost -U postgres iot_device_management

# 查看表结构
\dt

# 查看数据统计
SELECT 'tenants' as table_name, COUNT(*) as count FROM tenants
UNION ALL
SELECT 'devices', COUNT(*) FROM devices
UNION ALL
SELECT 'users', COUNT(*) FROM users;
```

## 🔒 安全配置

### 防火墙设置

```bash
# 在远程服务器上配置防火墙
sudo ufw allow 22    # SSH
sudo ufw allow 3001  # 前端
sudo ufw allow 3003  # 后端
sudo ufw enable
```

### SSL证书（可选）

```bash
# 安装Certbot
sudo apt-get install certbot

# 申请SSL证书（需要域名）
sudo certbot certonly --standalone -d your-domain.com

# 配置Nginx反向代理（可选）
sudo apt-get install nginx
# 配置Nginx配置文件
```

## 🚨 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查看端口占用
   sudo netstat -tlnp | grep :3001
   sudo netstat -tlnp | grep :3003
   
   # 杀死占用进程
   sudo kill -9 <PID>
   ```

2. **数据库连接失败**
   ```bash
   # 检查PostgreSQL状态
   sudo systemctl status postgresql
   
   # 检查数据库配置
   sudo -u postgres psql -c "\l"
   ```

3. **权限问题**
   ```bash
   # 修复文件权限
   sudo chown -R bnse:bnse /home/bnse/iot
   chmod +x /home/bnse/iot/*.sh
   ```

4. **依赖安装失败**
   ```bash
   # 清理npm缓存
   npm cache clean --force
   
   # 删除node_modules重新安装
   rm -rf node_modules package-lock.json
   npm install
   ```

### 查看日志

```bash
# 系统日志
sudo journalctl -u postgresql
sudo journalctl -f

# 应用日志
tail -f /home/bnse/iot/logs/backend.log
tail -f /home/bnse/iot/logs/frontend.log

# PM2日志（如果使用PM2）
pm2 logs
pm2 logs iot-backend
pm2 logs iot-frontend
```

## 📈 性能优化

### 数据库优化

```sql
-- 创建索引
CREATE INDEX IF NOT EXISTS idx_device_data_timestamp ON device_data(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- 分析表统计信息
ANALYZE;
```

### 应用优化

```bash
# 启用gzip压缩
# 在Nginx配置中添加gzip配置

# 使用PM2集群模式
pm2 start app.js -i max --name iot-backend
```

## 📞 技术支持

如果在部署过程中遇到问题：

1. 检查本文档的故障排除部分
2. 查看相关日志文件
3. 确认网络连接和防火墙设置
4. 验证服务器环境和依赖版本

## 📝 更新日志

- **v1.0.0** - 初始版本，支持基础部署
- **v1.1.0** - 添加数据库自动初始化
- **v1.2.0** - 支持一键部署和管理命令

---

**注意**: 在生产环境中，建议先在测试环境验证部署流程，确保所有功能正常后再进行正式部署。