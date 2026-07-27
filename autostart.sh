#!/bin/bash

# IoT系统自动启动脚本
# 用于系统启动时自动启动IoT服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs"
AUTOSTART_LOG="$LOGS_DIR/autostart.log"

# 确保日志目录存在
mkdir -p "$LOGS_DIR"

# 日志函数
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$AUTOSTART_LOG"
}

log_info() {
    log_with_timestamp "[INFO] $1"
}

log_success() {
    log_with_timestamp "[SUCCESS] $1"
}

log_error() {
    log_with_timestamp "[ERROR] $1"
}

# 等待网络就绪
wait_for_network() {
    log_info "等待网络连接..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if ping -c 1 8.8.8.8 >/dev/null 2>&1; then
            log_success "网络连接正常"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_info "网络连接检查 $attempt/$max_attempts..."
        sleep 2
    done
    
    log_error "网络连接超时"
    return 1
}

# 等待Redis服务
wait_for_redis() {
    log_info "等待Redis服务..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if redis-cli ping >/dev/null 2>&1; then
            log_success "Redis服务正常"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_info "Redis服务检查 $attempt/$max_attempts..."
        sleep 2
    done
    
    log_error "Redis服务连接超时"
    return 1
}

# 等待数据库服务
wait_for_database() {
    log_info "等待数据库服务..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        # 这里可以根据实际数据库类型调整检查方式
        if cd "$SCRIPT_DIR/backend" && timeout 10 node -e "require('./utils/database.js').testConnection().then(() => process.exit(0)).catch(() => process.exit(1))" >/dev/null 2>&1; then
            log_success "数据库服务正常"
            return 0
        fi
        
        attempt=$((attempt + 1))
        log_info "数据库服务检查 $attempt/$max_attempts..."
        sleep 2
    done
    
    log_error "数据库服务连接超时"
    return 1
}

# 启动IoT系统
start_iot_system() {
    log_info "开始启动IoT系统..."
    
    # 等待依赖服务
    if ! wait_for_network; then
        log_error "网络不可用，跳过自动启动"
        return 1
    fi
    
    if ! wait_for_redis; then
        log_error "Redis不可用，跳过自动启动"
        return 1
    fi
    
    if ! wait_for_database; then
        log_error "数据库不可用，跳过自动启动"
        return 1
    fi
    
    # 启动系统
    if bash "$SCRIPT_DIR/manage.sh" start >> "$AUTOSTART_LOG" 2>&1; then
        log_success "IoT系统启动成功"
        return 0
    else
        log_error "IoT系统启动失败"
        return 1
    fi
}

# 安装自动启动
install_autostart() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} 此操作需要root权限，请使用sudo运行"
        exit 1
    fi
    
    local cron_entry="@reboot $SCRIPT_DIR/autostart.sh start"
    local crontab_file="/var/spool/cron/crontabs/$(whoami)"
    
    echo -e "${BLUE}[INFO]${NC} 安装自动启动..."
    
    # 检查是否已存在
    if crontab -l 2>/dev/null | grep -q "$SCRIPT_DIR/autostart.sh"; then
        echo -e "${YELLOW}[WARNING]${NC} 自动启动已存在"
        return 0
    fi
    
    # 添加到crontab
    (crontab -l 2>/dev/null; echo "$cron_entry") | crontab -
    
    echo -e "${GREEN}[SUCCESS]${NC} 自动启动安装完成"
    echo "系统重启后将自动启动IoT服务"
}

# 卸载自动启动
uninstall_autostart() {
    if [ "$EUID" -ne 0 ]; then
        echo -e "${RED}[ERROR]${NC} 此操作需要root权限，请使用sudo运行"
        exit 1
    fi
    
    echo -e "${BLUE}[INFO]${NC} 卸载自动启动..."
    
    # 从crontab中移除
    crontab -l 2>/dev/null | grep -v "$SCRIPT_DIR/autostart.sh" | crontab -
    
    echo -e "${GREEN}[SUCCESS]${NC} 自动启动卸载完成"
}

# 显示帮助
show_help() {
    echo "IoT系统自动启动脚本"
    echo "=================="
    echo
    echo "用法: $0 [命令]"
    echo
    echo "命令:"
    echo "  start           启动IoT系统 (用于自动启动)"
    echo "  install         安装自动启动 (需要sudo)"
    echo "  uninstall       卸载自动启动 (需要sudo)"
    echo "  help            显示帮助信息"
    echo
    echo "示例:"
    echo "  sudo $0 install     # 安装自动启动"
    echo "  sudo $0 uninstall   # 卸载自动启动"
    echo
}

# 主函数
main() {
    case "${1:-help}" in
        start)
            start_iot_system
            ;;
        install)
            install_autostart
            ;;
        uninstall)
            uninstall_autostart
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}[ERROR]${NC} 未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"