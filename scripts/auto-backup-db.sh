#!/bin/bash

# 自动数据库备份脚本
# 用于定期备份PostgreSQL数据库，防止数据丢失

set -e

# 配置变量
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="iot_device_management"
DB_USER="postgres"
DB_PASSWORD="123456"
BACKUP_DIR="/mnt/mydisk/iot/backups"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/iot_backup_${DATE}.sql"
LOG_FILE="${BACKUP_DIR}/backup.log"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

# 记录开始时间
echo "[$(date)] 开始数据库备份..." >> "$LOG_FILE"

# 执行备份
export PGPASSWORD="$DB_PASSWORD"
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --verbose --clean --if-exists --create \
  --format=plain --file="$BACKUP_FILE"

if [ $? -eq 0 ]; then
    echo "[$(date)] 备份成功: $BACKUP_FILE" >> "$LOG_FILE"
    
    # 压缩备份文件
    gzip "$BACKUP_FILE"
    echo "[$(date)] 备份文件已压缩: ${BACKUP_FILE}.gz" >> "$LOG_FILE"
    
    # 删除7天前的备份文件
    find "$BACKUP_DIR" -name "iot_backup_*.sql.gz" -mtime +7 -delete
    echo "[$(date)] 已清理7天前的备份文件" >> "$LOG_FILE"
else
    echo "[$(date)] 备份失败!" >> "$LOG_FILE"
    exit 1
fi

echo "[$(date)] 数据库备份完成" >> "$LOG_FILE"