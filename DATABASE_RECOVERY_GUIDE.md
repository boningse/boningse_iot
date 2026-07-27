# 数据库恢复指南

## 概述
本指南用于处理IoT设备管理系统数据库被意外清理的情况。

## 问题识别

### 常见症状
- 前端显示"relation does not exist"错误
- 数据库表缺失或为空
- 用户无法登录或访问设备数据

### 检查步骤
```bash
# 1. 检查数据库连接
psql -h localhost -U postgres -d iot_device_management -c "\dt"

# 2. 检查核心表
psql -h localhost -U postgres -d iot_device_management -c "SELECT table_name FROM information_schema.tables WHERE table_name IN ('tenants', 'users', 'devices', 'device_data');"

# 3. 运行安全检查脚本
./scripts/db-security-check.sh
```

## 恢复步骤

### 1. 立即备份当前状态
```bash
# 即使数据库有问题，也要先备份当前状态
./scripts/auto-backup-db.sh
```

### 2. 重新初始化数据库结构
```bash
# 使用修复后的初始化脚本
cd backend
# 数据库初始化脚本已删除
```

### 3. 恢复数据（如果有备份）
```bash
# 从最近的备份恢复
psql -h localhost -U postgres -d iot_device_management < backups/latest_backup.sql
```

### 4. 验证恢复结果
```bash
# 检查表结构
psql -h localhost -U postgres -d iot_device_management -c "\dt"

# 检查数据完整性
./scripts/db-security-check.sh
```

## 预防措施

### 1. 隔离危险文件
已将包含DROP TABLE语句的`public.sql`重命名为`public.sql.dangerous_backup`

### 2. 定期备份
```bash
# 设置每日自动备份（添加到crontab）
0 2 * * * /mnt/mydisk/iot/scripts/auto-backup-db.sh
```

### 3. 访问控制
- 限制对SQL文件的直接执行权限
- 使用专用的数据库用户，避免使用超级用户
- 定期审查数据库操作日志

### 4. 监控告警
```bash
# 设置定期安全检查（添加到crontab）
*/30 * * * * /mnt/mydisk/iot/scripts/db-security-check.sh
```

## 根本原因分析

### 可能的原因
1. **意外执行public.sql**: 该文件包含大量DROP TABLE语句
2. **数据库连接中断**: 管理员命令导致连接终止
3. **脚本错误**: 自动化脚本意外执行了清理操作
4. **人为操作失误**: 手动执行了错误的SQL命令

### 预防建议
1. 将危险的SQL文件移出执行路径
2. 实施数据库操作的双重确认机制
3. 使用事务和回滚机制
4. 建立完善的备份和恢复流程

## 紧急联系

如果遇到无法解决的数据库问题：
1. 立即停止所有数据库操作
2. 保存当前状态的完整备份
3. 查看系统日志：`/mnt/mydisk/iot/logs/`
4. 联系系统管理员

## 相关文件

# 数据库初始化脚本已删除
- 自动备份脚本: `scripts/auto-backup-db.sh`
- 安全检查脚本: `scripts/db-security-check.sh`
- 危险文件备份: `database/sql/public.sql.dangerous_backup`
- 日志文件: `logs/db-security.log`, `logs/db-alerts.log`