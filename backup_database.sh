#!/bin/bash

# 数据库备份脚本
# 备份PostgreSQL数据库的结构和数据

# 设置颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 从环境变量或默认值获取数据库配置
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_NAME=${DB_NAME:-iot_device_management}
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-123456}

# 备份目录
BACKUP_DIR="./backups"
DATE=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/iot_backup_${DATE}.sql"
COMPRESSED_FILE="${BACKUP_FILE}.gz"

# 创建备份目录
mkdir -p "$BACKUP_DIR"

echo -e "${YELLOW}开始备份数据库...${NC}"
echo "数据库: $DB_NAME"
echo "主机: $DB_HOST:$DB_PORT"
echo "用户: $DB_USER"
echo "备份文件: $BACKUP_FILE"
echo "压缩文件: $COMPRESSED_FILE"
echo ""

# 设置密码环境变量
export PGPASSWORD="$DB_PASSWORD"

# 检查pg_dump是否可用
if ! command -v pg_dump &> /dev/null; then
    echo -e "${RED}错误: pg_dump 命令未找到，请安装PostgreSQL客户端工具${NC}"
    exit 1
fi

# 测试数据库连接
echo -e "${YELLOW}测试数据库连接...${NC}"
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" &> /dev/null; then
    echo -e "${RED}错误: 无法连接到数据库${NC}"
    exit 1
fi
echo -e "${GREEN}数据库连接正常${NC}"
echo ""

# 执行备份
echo -e "${YELLOW}正在备份数据库结构和数据...${NC}"
if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
    --verbose \
    --no-password \
    --format=plain \
    --no-owner \
    --no-privileges \
    --create \
    --clean \
    --if-exists \
    --file="$BACKUP_FILE"; then
    
    echo -e "${GREEN}数据库备份成功: $BACKUP_FILE${NC}"
    
    # 压缩备份文件
    echo -e "${YELLOW}正在压缩备份文件...${NC}"
    if gzip -c "$BACKUP_FILE" > "$COMPRESSED_FILE"; then
        echo -e "${GREEN}备份文件压缩成功: $COMPRESSED_FILE${NC}"
        
        # 显示文件大小
        ORIGINAL_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
        COMPRESSED_SIZE=$(du -h "$COMPRESSED_FILE" | cut -f1)
        echo "原始文件大小: $ORIGINAL_SIZE"
        echo "压缩文件大小: $COMPRESSED_SIZE"
        
        # 删除原始备份文件（保留压缩版本）
        rm "$BACKUP_FILE"
        echo -e "${GREEN}已删除原始备份文件，保留压缩版本${NC}"
    else
        echo -e "${RED}备份文件压缩失败${NC}"
    fi
else
    echo -e "${RED}数据库备份失败${NC}"
    exit 1
fi

# 清理旧备份（保留最近7个备份）
echo -e "${YELLOW}清理旧备份文件...${NC}"
find "$BACKUP_DIR" -name "iot_backup_*.sql.gz" -type f -mtime +7 -delete
echo -e "${GREEN}已清理7天前的备份文件${NC}"

# 显示备份列表
echo ""
echo -e "${YELLOW}当前备份文件列表:${NC}"
ls -lah "$BACKUP_DIR"/iot_backup_*.sql.gz 2>/dev/null || echo "没有找到备份文件"

echo ""
echo -e "${GREEN}数据库备份完成！${NC}"
echo "备份文件: $COMPRESSED_FILE"

# 清理环境变量
unset PGPASSWORD

echo ""
echo -e "${YELLOW}备份说明:${NC}"
echo "1. 备份包含完整的数据库结构和数据"
echo "2. 备份文件已压缩以节省空间"
echo "3. 自动清理7天前的备份文件"
echo "4. 恢复命令: gunzip -c $COMPRESSED_FILE | psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"