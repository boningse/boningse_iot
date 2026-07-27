#!/bin/bash

# IoT系统守护进程脚本
# 用于监控和自动重启IoT系统服务，确保长期稳定运行

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
FRONTEND_DIR="$SCRIPT_DIR/frontend"
LOGS_DIR="$SCRIPT_DIR/logs"
PIDS_DIR="$SCRIPT_DIR/pids"
DAEMON_LOG="$LOGS_DIR/daemon.log"
DAEMON_PID_FILE="$PIDS_DIR/daemon.pid"

# 配置参数
CHECK_INTERVAL=30  # 检查间隔（秒）
MAX_RESTART_ATTEMPTS=5  # 最大重启尝试次数
RESTART_COOLDOWN=60  # 重启冷却时间（秒）
HEALTH_CHECK_TIMEOUT=10  # 健康检查超时时间（秒）

# 确保目录存在
mkdir -p "$LOGS_DIR" "$PIDS_DIR"

# 日志函数
log_with_timestamp() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$DAEMON_LOG"
}

log_info() {
    log_with_timestamp "[INFO] $1"
}

log_success() {
    log_with_timestamp "[SUCCESS] $1"
}

log_warning() {
    log_with_timestamp "[WARNING] $1"
}

log_error() {
    log_with_timestamp "[ERROR] $1"
}

# 检查进程是否运行
check_process() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# 健康检查
health_check() {
    local service="$1"
    local url="$2"
    
    if command -v curl >/dev/null 2>&1; then
        if curl -s --max-time "$HEALTH_CHECK_TIMEOUT" "$url" >/dev/null 2>&1; then
            return 0
        fi
    elif command -v wget >/dev/null 2>&1; then
        if wget -q --timeout="$HEALTH_CHECK_TIMEOUT" --tries=1 -O /dev/null "$url" >/dev/null 2>&1; then
            return 0
        fi
    fi
    return 1
}

# 启动服务
start_service() {
    local service="$1"
    log_info "启动${service}服务..."
    
    cd "$SCRIPT_DIR"
    if [ "$service" = "backend" ]; then
        bash quick-start.sh start >/dev/null 2>&1 || {
            log_error "${service}服务启动失败"
            return 1
        }
    elif [ "$service" = "frontend" ]; then
        # 只启动前端（假设后端已运行）
        cd "$FRONTEND_DIR"
        if [ ! -d "node_modules" ]; then
            log_info "安装前端依赖..."
            npm install >/dev/null 2>&1
        fi
        nohup npm run dev > "$LOGS_DIR/frontend.log" 2>&1 &
        echo $! > "$PIDS_DIR/frontend.pid"
    fi
    
    sleep 5
    log_success "${service}服务启动完成"
}

# 重启服务
restart_service() {
    local service="$1"
    local pid_file="$PIDS_DIR/${service}.pid"
    
    log_warning "重启${service}服务..."
    
    # 停止服务
    if check_process "$pid_file"; then
        local pid=$(cat "$pid_file")
        kill "$pid" 2>/dev/null || true
        
        # 等待进程结束
        local count=0
        while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done
        
        # 强制杀死
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        rm -f "$pid_file"
    fi
    
    # 冷却时间
    sleep "$RESTART_COOLDOWN"
    
    # 启动服务
    start_service "$service"
}

# 监控服务
monitor_service() {
    local service="$1"
    local pid_file="$PIDS_DIR/${service}.pid"
    local health_url="$2"
    local restart_count_file="$LOGS_DIR/${service}_restart_count"
    
    # 初始化重启计数
    if [ ! -f "$restart_count_file" ]; then
        echo "0" > "$restart_count_file"
    fi
    
    local restart_count=$(cat "$restart_count_file")
    
    # 检查进程是否运行
    if ! check_process "$pid_file"; then
        log_error "${service}服务进程不存在"
        
        if [ "$restart_count" -lt "$MAX_RESTART_ATTEMPTS" ]; then
            restart_count=$((restart_count + 1))
            echo "$restart_count" > "$restart_count_file"
            log_info "尝试重启${service}服务 (第${restart_count}次)"
            restart_service "$service"
        else
            log_error "${service}服务重启次数已达上限，停止自动重启"
        fi
        return
    fi
    
    # 健康检查
    if [ -n "$health_url" ]; then
        if ! health_check "$service" "$health_url"; then
            log_warning "${service}服务健康检查失败"
            
            if [ "$restart_count" -lt "$MAX_RESTART_ATTEMPTS" ]; then
                restart_count=$((restart_count + 1))
                echo "$restart_count" > "$restart_count_file"
                log_info "尝试重启${service}服务 (第${restart_count}次)"
                restart_service "$service"
            else
                log_error "${service}服务重启次数已达上限，停止自动重启"
            fi
            return
        fi
    fi
    
    # 服务正常，重置重启计数
    if [ "$restart_count" -gt 0 ]; then
        echo "0" > "$restart_count_file"
        log_success "${service}服务恢复正常，重置重启计数"
    fi
}

# 清理函数
cleanup() {
    log_info "守护进程正在退出..."
    rm -f "$DAEMON_PID_FILE"
    exit 0
}

# 信号处理
trap cleanup SIGTERM SIGINT

# 守护进程主循环
daemon_loop() {
    log_info "IoT系统守护进程启动 (PID: $$)"
    echo $$ > "$DAEMON_PID_FILE"
    
    while true; do
        # 监控后端服务
        monitor_service "backend" "http://localhost:3003/api/health"
        
        # 监控前端服务
        monitor_service "frontend" "http://localhost:3000"
        
        # 等待下次检查
        sleep "$CHECK_INTERVAL"
    done
}

# 启动守护进程
start_daemon() {
    if [ -f "$DAEMON_PID_FILE" ] && kill -0 "$(cat "$DAEMON_PID_FILE")" 2>/dev/null; then
        echo -e "${YELLOW}守护进程已在运行 (PID: $(cat "$DAEMON_PID_FILE"))${NC}"
        return 0
    fi
    
    echo -e "${BLUE}启动IoT系统守护进程...${NC}"
    
    # 后台运行守护进程
    nohup bash "$0" --daemon > "$DAEMON_LOG" 2>&1 &
    
    sleep 2
    
    if [ -f "$DAEMON_PID_FILE" ] && kill -0 "$(cat "$DAEMON_PID_FILE")" 2>/dev/null; then
        echo -e "${GREEN}守护进程启动成功 (PID: $(cat "$DAEMON_PID_FILE"))${NC}"
        echo "日志文件: $DAEMON_LOG"
    else
        echo -e "${RED}守护进程启动失败${NC}"
        return 1
    fi
}

# 停止守护进程
stop_daemon() {
    if [ -f "$DAEMON_PID_FILE" ]; then
        local pid=$(cat "$DAEMON_PID_FILE")
        if kill -0 "$pid" 2>/dev/null; then
            echo -e "${BLUE}停止守护进程...${NC}"
            kill "$pid" 2>/dev/null || true
            
            # 等待进程结束
            local count=0
            while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
                sleep 1
                count=$((count + 1))
            done
            
            if kill -0 "$pid" 2>/dev/null; then
                kill -9 "$pid" 2>/dev/null || true
            fi
            
            rm -f "$DAEMON_PID_FILE"
            echo -e "${GREEN}守护进程已停止${NC}"
        else
            rm -f "$DAEMON_PID_FILE"
            echo -e "${YELLOW}守护进程未运行${NC}"
        fi
    else
        echo -e "${YELLOW}守护进程未运行${NC}"
    fi
}

# 查看守护进程状态
status_daemon() {
    echo "IoT系统守护进程状态:"
    echo "=================="
    
    if [ -f "$DAEMON_PID_FILE" ] && kill -0 "$(cat "$DAEMON_PID_FILE")" 2>/dev/null; then
        local pid=$(cat "$DAEMON_PID_FILE")
        echo -e "守护进程: ${GREEN}运行中${NC} (PID: $pid)"
        
        # 显示运行时间
        if command -v ps >/dev/null 2>&1; then
            local uptime=$(ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ' || echo "未知")
            echo "运行时间: $uptime"
        fi
        
        # 显示最近日志
        echo
        echo "最近日志 (最后10行):"
        echo "=================="
        if [ -f "$DAEMON_LOG" ]; then
            tail -n 10 "$DAEMON_LOG"
        else
            echo "无日志文件"
        fi
    else
        echo -e "守护进程: ${RED}未运行${NC}"
        rm -f "$DAEMON_PID_FILE"
    fi
}

# 显示帮助信息
show_help() {
    echo "IoT系统守护进程管理脚本"
    echo "======================="
    echo
    echo "用法: $0 [命令]"
    echo
    echo "命令:"
    echo "  start     启动守护进程"
    echo "  stop      停止守护进程"
    echo "  restart   重启守护进程"
    echo "  status    查看守护进程状态"
    echo "  logs      查看守护进程日志"
    echo "  help      显示帮助信息"
    echo
    echo "守护进程功能:"
    echo "  - 自动监控前端和后端服务"
    echo "  - 服务异常时自动重启"
    echo "  - 健康检查和故障恢复"
    echo "  - 详细的日志记录"
    echo
    echo "配置参数:"
    echo "  检查间隔: ${CHECK_INTERVAL}秒"
    echo "  最大重启次数: ${MAX_RESTART_ATTEMPTS}次"
    echo "  重启冷却时间: ${RESTART_COOLDOWN}秒"
    echo
}

# 查看日志
show_logs() {
    if [ -f "$DAEMON_LOG" ]; then
        echo "守护进程日志:"
        echo "============"
        tail -f "$DAEMON_LOG"
    else
        echo "日志文件不存在: $DAEMON_LOG"
    fi
}

# 主函数
main() {
    case "${1:-help}" in
        --daemon)
            daemon_loop
            ;;
        start)
            start_daemon
            ;;
        stop)
            stop_daemon
            ;;
        restart)
            stop_daemon
            sleep 2
            start_daemon
            ;;
        status)
            status_daemon
            ;;
        logs)
            show_logs
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo -e "${RED}未知命令: $1${NC}"
            show_help
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"