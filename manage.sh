#!/bin/bash

# IoT系统进程管理脚本
# 提供完整的进程管理功能，包括启动、停止、监控、自动重启等

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOGS_DIR="$SCRIPT_DIR/logs"
PIDS_DIR="$SCRIPT_DIR/pids"
SERVICE_FILE="$SCRIPT_DIR/iot-system.service"
SYSTEM_SERVICE_PATH="/etc/systemd/system/iot-system.service"

# 确保目录存在
mkdir -p "$LOGS_DIR" "$PIDS_DIR"

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_header() {
    echo -e "${CYAN}$1${NC}"
}

# 检查是否为root用户
check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "此操作需要root权限，请使用sudo运行"
        exit 1
    fi
}

# 检查系统服务状态
check_system_service() {
    if systemctl is-active --quiet iot-system; then
        return 0
    else
        return 1
    fi
}

# 安装系统服务
install_service() {
    check_root
    
    log_info "安装IoT系统服务..."
    
    # 复制服务文件
    cp "$SERVICE_FILE" "$SYSTEM_SERVICE_PATH"
    
    # 重新加载systemd
    systemctl daemon-reload
    
    # 启用服务
    systemctl enable iot-system
    
    log_success "IoT系统服务安装完成"
    log_info "使用以下命令管理服务:"
    echo "  sudo systemctl start iot-system    # 启动服务"
    echo "  sudo systemctl stop iot-system     # 停止服务"
    echo "  sudo systemctl status iot-system   # 查看状态"
    echo "  sudo systemctl restart iot-system  # 重启服务"
}

# 卸载系统服务
uninstall_service() {
    check_root
    
    log_info "卸载IoT系统服务..."
    
    # 停止并禁用服务
    systemctl stop iot-system 2>/dev/null || true
    systemctl disable iot-system 2>/dev/null || true
    
    # 删除服务文件
    rm -f "$SYSTEM_SERVICE_PATH"
    
    # 重新加载systemd
    systemctl daemon-reload
    
    log_success "IoT系统服务卸载完成"
}

# 启动系统
start_system() {
    log_header "启动IoT系统"
    log_header "============"
    
    # 检查是否已安装为系统服务
    if [ -f "$SYSTEM_SERVICE_PATH" ]; then
        log_info "使用系统服务启动..."
        if check_system_service; then
            log_warning "系统服务已在运行"
        else
            sudo systemctl start iot-system
            log_success "系统服务启动成功"
        fi
    else
        log_info "使用脚本启动..."
        bash "$SCRIPT_DIR/quick-start.sh" start
    fi
    
    # 启动守护进程
    log_info "启动守护进程..."
    bash "$SCRIPT_DIR/daemon.sh" start
}

# 停止系统
stop_system() {
    log_header "停止IoT系统"
    log_header "============"
    
    # 停止守护进程
    log_info "停止守护进程..."
    bash "$SCRIPT_DIR/daemon.sh" stop
    
    # 检查是否使用系统服务
    if [ -f "$SYSTEM_SERVICE_PATH" ]; then
        log_info "使用系统服务停止..."
        if check_system_service; then
            sudo systemctl stop iot-system
            log_success "系统服务停止成功"
        else
            log_warning "系统服务未运行"
        fi
    else
        log_info "使用脚本停止..."
        bash "$SCRIPT_DIR/quick-start.sh" stop
    fi
}

# 重启系统
restart_system() {
    log_header "重启IoT系统"
    log_header "============"
    
    stop_system
    sleep 3
    start_system
}

# 查看系统状态
status_system() {
    log_header "IoT系统状态"
    log_header "============"
    
    # 系统服务状态
    if [ -f "$SYSTEM_SERVICE_PATH" ]; then
        echo -e "${CYAN}系统服务状态:${NC}"
        systemctl status iot-system --no-pager -l || true
        echo
    fi
    
    # 应用状态
    echo -e "${CYAN}应用状态:${NC}"
    bash "$SCRIPT_DIR/status.sh"
    echo
    
    # 守护进程状态
    echo -e "${CYAN}守护进程状态:${NC}"
    bash "$SCRIPT_DIR/daemon.sh" status
    echo
    
    # 资源使用情况
    echo -e "${CYAN}资源使用情况:${NC}"
    echo "内存使用:"
    free -h
    echo
    echo "磁盘使用:"
    df -h "$SCRIPT_DIR"
    echo
    
    # 网络连接
    echo -e "${CYAN}网络连接:${NC}"
    if command -v netstat >/dev/null 2>&1; then
        netstat -tlnp | grep -E ':(3000|3003)' || echo "无相关端口监听"
    else
        echo "netstat 命令不可用"
    fi
}

# 查看日志
view_logs() {
    local service="${1:-all}"
    
    case "$service" in
        backend)
            log_info "查看后端日志..."
            tail -f "$LOGS_DIR/backend.log"
            ;;
        frontend)
            log_info "查看前端日志..."
            tail -f "$LOGS_DIR/frontend.log"
            ;;
        daemon)
            log_info "查看守护进程日志..."
            bash "$SCRIPT_DIR/daemon.sh" logs
            ;;
        system)
            if [ -f "$SYSTEM_SERVICE_PATH" ]; then
                log_info "查看系统服务日志..."
                journalctl -u iot-system -f
            else
                log_error "系统服务未安装"
            fi
            ;;
        all|*)
            log_info "查看所有日志..."
            echo "可用的日志类型:"
            echo "  backend  - 后端服务日志"
            echo "  frontend - 前端服务日志"
            echo "  daemon   - 守护进程日志"
            echo "  system   - 系统服务日志"
            echo
            echo "使用方法: $0 logs [类型]"
            ;;
    esac
}

# 健康检查
health_check() {
    log_header "IoT系统健康检查"
    log_header "==============="
    
    local all_healthy=true
    
    # 检查后端服务
    echo -n "后端服务健康检查: "
    if curl -s --max-time 10 "http://localhost:3003/api/health" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ 正常${NC}"
    else
        echo -e "${RED}✗ 异常${NC}"
        all_healthy=false
    fi
    
    # 检查前端服务
    echo -n "前端服务健康检查: "
    if curl -s --max-time 10 "http://localhost:3000" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ 正常${NC}"
    else
        echo -e "${RED}✗ 异常${NC}"
        all_healthy=false
    fi
    
    # 检查Redis连接
    echo -n "Redis连接检查: "
    if redis-cli -a "${REDIS_PASSWORD:-Anginfo@123}" ping >/dev/null 2>&1; then
        echo -e "${GREEN}✓ 正常${NC}"
    else
        echo -e "${RED}✗ 异常${NC}"
        all_healthy=false
    fi
    
    # 检查数据库连接
    echo -n "数据库连接检查: "
    if cd "$SCRIPT_DIR/backend" && node -e "require('./utils/database.js').testConnection().then(() => process.exit(0)).catch(() => process.exit(1))" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ 正常${NC}"
    else
        echo -e "${RED}✗ 异常${NC}"
        all_healthy=false
    fi
    
    echo
    if [ "$all_healthy" = true ]; then
        log_success "所有服务健康检查通过"
    else
        log_error "部分服务健康检查失败"
        return 1
    fi
}

# 性能监控
performance_monitor() {
    log_header "IoT系统性能监控"
    log_header "==============="
    
    # CPU和内存使用
    echo -e "${CYAN}系统资源:${NC}"
    top -bn1 | head -5
    echo
    
    # 进程信息
    echo -e "${CYAN}IoT相关进程:${NC}"
    ps aux | grep -E '(node|npm)' | grep -v grep || echo "无相关进程"
    echo
    
    # 网络连接
    echo -e "${CYAN}网络连接:${NC}"
    if command -v ss >/dev/null 2>&1; then
        ss -tlnp | grep -E ':(3000|3003)' || echo "无相关端口监听"
    elif command -v netstat >/dev/null 2>&1; then
        netstat -tlnp | grep -E ':(3000|3003)' || echo "无相关端口监听"
    fi
    echo
    
    # 磁盘使用
    echo -e "${CYAN}磁盘使用:${NC}"
    du -sh "$SCRIPT_DIR"/* 2>/dev/null | sort -hr
}

# 清理日志
clean_logs() {
    log_info "清理旧日志文件..."
    
    # 清理超过7天的日志
    find "$LOGS_DIR" -name "*.log" -type f -mtime +7 -delete 2>/dev/null || true
    
    # 压缩大于10MB的日志文件
    find "$LOGS_DIR" -name "*.log" -type f -size +10M -exec gzip {} \; 2>/dev/null || true
    
    log_success "日志清理完成"
}

# 备份配置
backup_config() {
    local backup_dir="$SCRIPT_DIR/backups/config_$(date +%Y%m%d_%H%M%S)"
    
    log_info "备份配置文件..."
    
    mkdir -p "$backup_dir"
    
    # 备份环境配置
    cp "$SCRIPT_DIR/backend/.env" "$backup_dir/" 2>/dev/null || true
    cp "$SCRIPT_DIR/frontend/.env" "$backup_dir/" 2>/dev/null || true
    
    # 备份脚本文件
    cp "$SCRIPT_DIR"/*.sh "$backup_dir/" 2>/dev/null || true
    
    # 备份服务文件
    cp "$SCRIPT_DIR"/*.service "$backup_dir/" 2>/dev/null || true
    
    log_success "配置备份完成: $backup_dir"
}

# 显示帮助信息
show_help() {
    echo "IoT系统进程管理脚本"
    echo "=================="
    echo
    echo "用法: $0 [命令] [参数]"
    echo
    echo "基本命令:"
    echo "  start           启动IoT系统"
    echo "  stop            停止IoT系统"
    echo "  restart         重启IoT系统"
    echo "  status          查看系统状态"
    echo "  health          健康检查"
    echo "  monitor         性能监控"
    echo
    echo "服务管理:"
    echo "  install         安装为系统服务 (需要sudo)"
    echo "  uninstall       卸载系统服务 (需要sudo)"
    echo
    echo "日志管理:"
    echo "  logs [类型]     查看日志 (backend/frontend/daemon/system/all)"
    echo "  clean           清理旧日志文件"
    echo
    echo "维护命令:"
    echo "  backup          备份配置文件"
    echo "  help            显示帮助信息"
    echo
    echo "示例:"
    echo "  $0 start                # 启动系统"
    echo "  $0 logs backend         # 查看后端日志"
    echo "  sudo $0 install         # 安装系统服务"
    echo "  $0 health               # 健康检查"
    echo
}

# 主函数
main() {
    case "${1:-help}" in
        start)
            start_system
            ;;
        stop)
            stop_system
            ;;
        restart)
            restart_system
            ;;
        status)
            status_system
            ;;
        health)
            health_check
            ;;
        monitor)
            performance_monitor
            ;;
        install)
            install_service
            ;;
        uninstall)
            uninstall_service
            ;;
        logs)
            view_logs "$2"
            ;;
        clean)
            clean_logs
            ;;
        backup)
            backup_config
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            log_error "未知命令: $1"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"