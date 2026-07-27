# IoT设备管理系统备份指南

本指南提供了IoT设备管理系统的完整备份和恢复方案。

## 📋 目录

- [备份方案概述](#备份方案概述)
- [完整备份](#完整备份)
- [快速备份](#快速备份)
- [恢复指南](#恢复指南)
- [备份最佳实践](#备份最佳实践)
- [故障排除](#故障排除)

## 🎯 备份方案概述

### 1. 完整备份 (`backup-project.sh`)
- **用途**: 生产环境备份、系统迁移、长期存档
- **包含内容**: 项目文件 + 数据库 + 完整文档
- **执行时间**: 较长（包含数据库操作）
- **文件大小**: 较大

### 2. 快速备份 (`quick-backup.sh`)
- **用途**: 开发过程中的代码备份、日常备份
- **包含内容**: 仅项目文件（不含数据库）
- **执行时间**: 快速
- **文件大小**: 较小

## 🔧 完整备份

### 使用方法

```bash
# 执行完整备份
./backup-project.sh
```

### 备份内容

- ✅ 项目源代码
- ✅ 配置文件 (`.env` 等)
- ✅ SQL脚本和数据库迁移文件
- ✅ 文档文件

- ✅ 部署脚本
- ✅ 数据库完整备份 (如果可用)
- ✅ 数据库结构备份 (如果可用)

### 排除内容

- ❌ `node_modules/` 目录
- ❌ `.git/` 目录
- ❌ 日志文件 (`backend/logs/*.log`)
- ❌ 临时文件 (`*.tmp`, `*.temp`)
- ❌ 构建输出 (`dist/`, `build/`)
- ❌ IDE配置 (`.vscode/`, `.idea/`)

### 备份位置

```
/home/ls/backups/
├── iot_backup_20241220_143022.tar.gz  # 压缩备份
└── iot_backup_20241220_143022/        # 未压缩备份（可选保留）
    ├── project/                       # 项目文件
    ├── database/                      # 数据库备份
    └── backup_info.txt               # 备份信息
```

### 环境变量配置

备份脚本会自动读取 `.env` 文件中的数据库配置：

```bash
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_platform
DB_USER=postgres
DB_PASSWORD=your_password
```

## ⚡ 快速备份

### 使用方法

```bash
# 执行快速备份
./quick-backup.sh
```

### 备份内容

- ✅ 项目源代码
- ✅ 配置文件
- ✅ SQL脚本
- ✅ 文档文件

- ❌ 数据库备份（不包含）

### 备份位置

```
/home/ls/backups/quick/
├── iot_quick_20241220_143022.tar.gz
├── iot_quick_20241220_142015.tar.gz
└── iot_quick_20241220_141008.tar.gz
```

### 自动清理

快速备份会自动保留最近的3个备份文件，自动删除更早的备份。

## 🔄 恢复指南

### 1. 项目文件恢复

```bash
# 解压备份文件
tar -xzf /home/ls/backups/iot_backup_20241220_143022.tar.gz -C /path/to/restore/

# 进入项目目录
cd /path/to/restore/iot_backup_20241220_143022/project/

# 安装依赖
npm install
cd backend && npm install && cd ..
```

### 2. 环境配置

```bash
# 复制并编辑环境变量文件
cp .env.example .env
cp backend/.env.example backend/.env

# 编辑配置文件
nano .env
nano backend/.env
```

### 3. 数据库恢复

```bash
# 创建数据库
psql -U postgres -c "CREATE DATABASE iot_platform;"

# 恢复完整数据库
psql -U postgres -d iot_platform < database/database_full_20241220_143022.sql

# 或者仅恢复结构
psql -U postgres -d iot_platform < database/database_schema_20241220_143022.sql
```

### 4. 启动服务

```bash
# 使用系统脚本启动
./iot-system.sh start

# 或者直接启动
npm start
```

## 📝 备份最佳实践

### 1. 备份频率建议

- **生产环境**: 每日完整备份
- **开发环境**: 重要更改前快速备份
- **重大更新前**: 必须执行完整备份

### 2. 备份存储建议

```bash
# 创建备份目录结构
mkdir -p /home/ls/backups/{daily,weekly,monthly}

# 设置定时备份（crontab示例）
# 每日凌晨2点执行完整备份
0 2 * * * /home/ls/iot/backup-project.sh

# 每小时执行快速备份（工作时间）
0 9-18 * * 1-5 /home/ls/iot/quick-backup.sh
```

### 3. 备份验证

```bash
# 验证备份文件完整性
tar -tzf /home/ls/backups/iot_backup_20241220_143022.tar.gz > /dev/null
echo "备份文件完整性: $?"

# 检查备份文件大小
du -h /home/ls/backups/iot_backup_*.tar.gz
```

### 4. 远程备份

```bash
# 同步到远程服务器
rsync -avz /home/ls/backups/ user@remote-server:/backup/iot/

# 上传到云存储（示例）
# aws s3 sync /home/ls/backups/ s3://your-backup-bucket/iot/
```

## 🔧 故障排除

### 1. 数据库备份失败

**问题**: `pg_dump: error: connection to database failed`

**解决方案**:
```bash
# 检查数据库连接
psql -h localhost -U postgres -d iot_platform -c "\l"

# 检查环境变量
echo $DB_HOST $DB_PORT $DB_NAME $DB_USER

# 手动设置数据库密码
export PGPASSWORD="your_password"
```

### 2. 权限问题

**问题**: `Permission denied`

**解决方案**:
```bash
# 检查脚本权限
ls -la backup-project.sh quick-backup.sh

# 添加执行权限
chmod +x backup-project.sh quick-backup.sh

# 检查备份目录权限
mkdir -p /home/ls/backups
chmod 755 /home/ls/backups
```

### 3. 磁盘空间不足

**问题**: `No space left on device`

**解决方案**:
```bash
# 检查磁盘空间
df -h

# 清理旧备份
find /home/ls/backups -name "iot_backup_*.tar.gz" -mtime +30 -delete

# 检查项目大小
du -sh /home/ls/iot
```

### 4. 恢复失败

**问题**: 恢复后服务无法启动

**解决方案**:
```bash
# 检查依赖安装
npm list --depth=0

# 重新安装依赖
rm -rf node_modules package-lock.json
npm install

# 检查环境变量
cat .env

# 检查数据库连接
npm run test:db
```

## 📞 支持

如果在备份或恢复过程中遇到问题，请：

1. 检查 `backup_info.txt` 文件中的详细信息
2. 查看系统日志: `journalctl -f`
3. 检查应用日志: `tail -f backend/logs/app.log`
4. 参考本指南的故障排除部分

---

**注意**: 请定期测试备份恢复流程，确保备份文件的可用性和完整性。