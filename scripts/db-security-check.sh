#!/bin/bash

# 数据库安全检查脚本
# 用于检查数据库状态和防止意外的数据清理

set -e

# 配置变量
DB_HOST="localhost"
DB_PORT="5432"
DB_NAME="iot_device_management"
DB_USER="postgres"
DB_PASSWORD="123456"
LOG_FILE="/mnt/mydisk/iot/logs/db-security.log"
ALERT_FILE="/mnt/mydisk/iot/logs/db-alerts.log"

# 创建日志目录
mkdir -p "$(dirname "$LOG_FILE")"

# 记录检查时间
echo "[$(date)] 开始数据库安全检查..." >> "$LOG_FILE"

# 检查核心表是否存在
export PGPASSWORD="$DB_PASSWORD"
CORE_TABLES=("tenants" "users" "devices" "device_data" "device_types")
MISSING_TABLES=()

for table in "${CORE_TABLES[@]}"; do
    result=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
        -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name='$table';" 2>/dev/null || echo "0")
    
    if [ "$(echo $result | tr -d ' ')" = "0" ]; then
        MISSING_TABLES+=("$table")
    fi
done

# 检查表记录数
if [ ${#MISSING_TABLES[@]} -eq 0 ]; then
    echo "[$(date)] 所有核心表存在" >> "$LOG_FILE"
    
    # 检查表是否为空（可能被清理）
    for table in "${CORE_TABLES[@]}"; do
        count=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
            -t -c "SELECT COUNT(*) FROM $table;" 2>/dev/null || echo "0")
        count=$(echo $count | tr -d ' ')
        echo "[$(date)] 表 $table 记录数: $count" >> "$LOG_FILE"
        
        # 如果关键表为空，记录警告
        if [ "$count" = "0" ] && [ "$table" != "device_data" ]; then
            echo "[$(date)] 警告: 表 $table 为空，可能被意外清理!" >> "$ALERT_FILE"
        fi
    done
else
    echo "[$(date)] 严重警告: 缺失核心表: ${MISSING_TABLES[*]}" >> "$ALERT_FILE"
    echo "[$(date)] 严重警告: 缺失核心表: ${MISSING_TABLES[*]}" >> "$LOG_FILE"
fi

# 检查危险文件
DANGEROUS_FILES=(
    "/mnt/mydisk/iot/database/sql/public.sql"
    "/mnt/mydisk/iot/database/sql/drop_tables.sql"
    "/mnt/mydisk/iot/database/sql/cleanup.sql"
)

for file in "${DANGEROUS_FILES[@]}"; do
    if [ -f "$file" ]; then
        echo "[$(date)] 警告: 发现危险文件 $file" >> "$ALERT_FILE"
        echo "[$(date)] 建议重命名或移除危险文件: $file" >> "$LOG_FILE"
    fi
done

# 检查最近的数据库连接日志中是否有异常
if [ -f "/mnt/mydisk/iot/backend/logs/database.log" ]; then
    recent_errors=$(tail -100 /mnt/mydisk/iot/backend/logs/database.log | grep -i "drop\|truncate\|delete from" | wc -l)
    if [ "$recent_errors" -gt 0 ]; then
        echo "[$(date)] 警告: 检测到最近的数据库清理操作" >> "$ALERT_FILE"
    fi
fi

echo "[$(date)] 数据库安全检查完成" >> "$LOG_FILE"

# 如果有警告，显示给用户
if [ -f "$ALERT_FILE" ] && [ -s "$ALERT_FILE" ]; then
    echo "发现数据库安全警告，请查看: $ALERT_FILE"
    tail -5 "$ALERT_FILE"
fi