# 数据库备份与恢复指南

## 概述

本项目提供了完整的PostgreSQL数据库备份和恢复解决方案，包括自动化脚本和详细的操作指南。

## 备份信息

### 数据库配置
- **数据库类型**: PostgreSQL
- **数据库名**: iot_device_management
- **主机**: localhost:5432
- **用户**: postgres

### 备份内容
- 完整的数据库结构（表、索引、约束、触发器等）
- 所有表的数据
- 用户权限和角色（如果适用）
- 存储过程和函数

## 备份脚本使用

### 执行备份

```bash
# 使用默认配置备份
./backup_database.sh

# 或者设置环境变量后备份
DB_HOST=localhost DB_PORT=5432 DB_NAME=iot_device_management DB_USER=postgres DB_PASSWORD=123456 ./backup_database.sh
```

### 备份特性

1. **自动压缩**: 备份文件自动使用gzip压缩，节省存储空间
2. **时间戳命名**: 备份文件包含创建时间戳，便于管理
3. **自动清理**: 自动删除7天前的旧备份文件
4. **连接测试**: 备份前自动测试数据库连接
5. **详细日志**: 提供详细的备份过程信息

### 备份文件格式

```
iot_backup_YYYYMMDD_HHMMSS.sql.gz
```

例如: `iot_backup_20250720_200821.sql.gz`

## 恢复脚本使用

### 查看可用备份

```bash
./restore_database.sh --help
```

### 恢复最新备份

```bash
./restore_database.sh
```

### 恢复指定备份

```bash
./restore_database.sh ./backups/iot_backup_20250720_200821.sql.gz
```

### 恢复注意事项

⚠️ **重要警告**: 恢复操作将完全替换现有数据库，请确保：

1. 已停止所有使用数据库的应用程序
2. 已确认要恢复的备份文件是正确的
3. 已做好当前数据的备份（如果需要）

## 当前备份状态

### 最新备份信息

- **备份时间**: 2025-07-20 20:08:21
- **备份文件**: `iot_backup_20250720_200821.sql.gz`
- **文件大小**: 1.4M (压缩后)
- **原始大小**: 8.8M
- **压缩比**: 约84%

### 备份文件列表

```
-rw-rw-r-- 1 bnse bnse 990K Jul 13 12:50 iot_backup_20250713_125056.sql.gz
-rw-rw-r-- 1 bnse bnse 1.4M Jul 20 20:08 iot_backup_20250720_200821.sql.gz
```

## 手动备份命令

如果需要手动执行备份，可以使用以下命令：

```bash
# 完整备份（结构+数据）
pg_dump -h localhost -p 5432 -U postgres -d iot_device_management \
    --verbose --no-password --format=plain --no-owner --no-privileges \
    --create --clean --if-exists \
    --file=backup_$(date +"%Y%m%d_%H%M%S").sql

# 仅备份结构
pg_dump -h localhost -p 5432 -U postgres -d iot_device_management \
    --schema-only --file=schema_backup.sql

# 仅备份数据
pg_dump -h localhost -p 5432 -U postgres -d iot_device_management \
    --data-only --file=data_backup.sql
```

## 手动恢复命令

```bash
# 从压缩备份恢复
gunzip -c ./backups/iot_backup_20250720_200821.sql.gz | \
    psql -h localhost -p 5432 -U postgres -d iot_device_management

# 从未压缩备份恢复
psql -h localhost -p 5432 -U postgres -d iot_device_management \
    -f backup_file.sql
```

## 定期备份设置

### 使用crontab设置自动备份

```bash
# 编辑crontab
crontab -e

# 添加以下行（每天凌晨2点备份）
0 2 * * * cd /mnt/mydisk/iot && ./backup_database.sh >> ./logs/backup.log 2>&1
```

### 备份监控

建议设置备份监控，确保备份正常执行：

1. 检查备份文件是否按时生成
2. 验证备份文件完整性
3. 监控备份日志中的错误信息
4. 定期测试恢复流程

## 故障排除

### 常见问题

1. **连接失败**
   - 检查数据库服务是否运行
   - 验证连接参数（主机、端口、用户名、密码）
   - 检查防火墙设置

2. **权限错误**
   - 确保数据库用户有足够的权限
   - 检查文件系统权限

3. **磁盘空间不足**
   - 清理旧备份文件
   - 检查可用磁盘空间

4. **备份文件损坏**
   - 使用 `gunzip -t` 测试压缩文件完整性
   - 重新创建备份

### 日志文件

- 备份日志: `./logs/backup.log`
- 应用日志: `./backend/logs/`

## 安全建议

1. **密码安全**
   - 不要在脚本中硬编码密码
   - 使用环境变量或配置文件
   - 定期更换数据库密码

2. **备份文件安全**
   - 限制备份文件的访问权限
   - 考虑加密敏感备份
   - 定期清理旧备份

3. **网络安全**
   - 使用SSL连接（生产环境）
   - 限制数据库访问IP
   - 使用VPN或专用网络

## 联系信息

如有问题或需要帮助，请联系系统管理员或查看项目文档。

---

**最后更新**: 2025-07-20  
**版本**: 1.0