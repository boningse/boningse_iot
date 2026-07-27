#!/bin/bash

# 数据库恢复脚本
# 从备份文件恢复PostgreSQL数据库

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

# 显示使用说明
show_usage() {
    echo "使用方法: $0 [备份文件路径]"
    echo ""
    echo "示例:"
    echo "  $0                                    # 使用最新的备份文件"
    echo "  $0 ./backups/iot_backup_20250720_200821.sql.gz  # 使用指定的备份文件"
    echo ""
    echo "可用的备份文件:"
    ls -lah "$BACKUP_DIR"/iot_backup_*.sql.gz 2>/dev/null || echo "  没有找到备份文件"
}

# 获取备份文件
get_backup_file() {
    if [ -n "$1" ]; then
        # 使用指定的备份文件
        if [ -f "$1" ]; then
            echo "$1"
        else
            echo -e "${RED}错误: 指定的备份文件不存在: $1${NC}"
            exit 1
        fi
    else
        # 使用最新的备份文件
        LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/iot_backup_*.sql.gz 2>/dev/null | head -n1)
        if [ -n "$LATEST_BACKUP" ]; then
            echo "$LATEST_BACKUP"
        else
            echo -e "${RED}错误: 没有找到备份文件${NC}"
            exit 1
        fi
    fi
}

# 检查参数
if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
    show_usage
    exit 0
fi

# 获取要恢复的备份文件
BACKUP_FILE=$(get_backup_file "$1")

echo -e "${YELLOW}数据库恢复脚本${NC}"
echo "数据库: $DB_NAME"
echo "主机: $DB_HOST:$DB_PORT"
echo "用户: $DB_USER"
echo "备份文件: $BACKUP_FILE"
echo ""

# 确认操作
echo -e "${RED}警告: 此操作将完全替换现有数据库！${NC}"
read -p "确定要继续吗？(输入 'yes' 确认): " confirm
if [ "$confirm" != "yes" ]; then
    echo "操作已取消"
    exit 0
fi

# 设置密码环境变量
export PGPASSWORD="$DB_PASSWORD"

# 检查必要的工具
if ! command -v psql &> /dev/null; then
    echo -e "${RED}错误: psql 命令未找到，请安装PostgreSQL客户端工具${NC}"
    exit 1
fi

if ! command -v gunzip &> /dev/null; then
    echo -e "${RED}错误: gunzip 命令未找到${NC}"
    exit 1
fi

# 测试数据库连接
echo -e "${YELLOW}测试数据库连接...${NC}"
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" &> /dev/null; then
    echo -e "${RED}错误: 无法连接到数据库服务器${NC}"
    exit 1
fi
echo -e "${GREEN}数据库连接正常${NC}"
echo ""

# 检查备份文件
echo -e "${YELLOW}检查备份文件...${NC}"
if ! gunzip -t "$BACKUP_FILE" &> /dev/null; then
    echo -e "${RED}错误: 备份文件损坏或格式不正确${NC}"
    exit 1
fi
echo -e "${GREEN}备份文件检查通过${NC}"
echo ""

# 创建临时解压文件
TEMP_SQL_FILE="/tmp/restore_$(basename "$BACKUP_FILE" .gz)"

echo -e "${YELLOW}正在解压备份文件...${NC}"
if gunzip -c "$BACKUP_FILE" > "$TEMP_SQL_FILE"; then
    echo -e "${GREEN}备份文件解压成功${NC}"
else
    echo -e "${RED}备份文件解压失败${NC}"
    exit 1
fi

# 执行恢复
echo -e "${YELLOW}正在恢复数据库...${NC}"
echo "这可能需要几分钟时间，请耐心等待..."
echo ""

if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -f "$TEMP_SQL_FILE" &> /tmp/restore.log; then
    echo -e "${GREEN}数据库恢复成功！${NC}"
else
    echo -e "${RED}数据库恢复失败${NC}"
    echo "错误日志:"
    tail -20 /tmp/restore.log
    rm -f "$TEMP_SQL_FILE"
    exit 1
fi

# 清理临时文件
rm -f "$TEMP_SQL_FILE"
rm -f /tmp/restore.log

# 验证恢复结果
echo -e "${YELLOW}验证恢复结果...${NC}"
if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "\dt" &> /dev/null; then
    echo -e "${GREEN}数据库恢复验证成功${NC}"
    
    # 显示表数量
    TABLE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
    echo "恢复的表数量: $TABLE_COUNT"
else
    echo -e "${RED}数据库恢复验证失败${NC}"
fi

# 清理环境变量
unset PGPASSWORD

echo ""
echo -e "${GREEN}数据库恢复完成！${NC}"
echo "备份文件: $BACKUP_FILE"
echo "目标数据库: $DB_NAME"

echo ""
echo -e "${YELLOW}恢复说明:${NC}"
echo "1. 数据库已从备份文件完全恢复"
echo "2. 所有原有数据已被替换"
echo "3. 请验证应用程序功能是否正常"