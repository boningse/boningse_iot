#!/bin/bash

# IoT系统快速停止脚本
# 快速停止所有IoT系统服务

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS_DIR="$SCRIPT_DIR/pids"

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

# 停止服务
stop_service() {
    local service_name="$1"
    local pid_file="$PIDS_DIR/${service_name}.pid"
    
    if check_process "$pid_file"; then
        local pid=$(cat "$pid_file")
        log_info "停止${service_name}服务 (PID: $pid)..."
        
        kill "$pid" 2>/dev/null || true
        
        # 等待进程结束
        local count=0
        while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done
        
        # 如果进程仍在运行，强制杀死
        if kill -0 "$pid" 2>/dev/null; then
            log_warning "强制停止${service_name}服务..."
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        rm -f "$pid_file"
        log_success "${service_name}服务已停止"
    else
        log_warning "${service_name}服务未运行"
    fi
}

# 主函数
main() {
    log_info "正在停止IoT系统所有服务..."
    echo
    
    # 停止前端服务
    stop_service "前端"
    
    # 停止后端服务
    stop_service "后端"
    
    # 额外清理：查找并停止可能的残留进程
    log_info "清理残留进程..."
    
    # 查找并停止Node.js进程（谨慎操作）
    local node_processes=$(pgrep -f "node.*app.js" 2>/dev/null || true)
    if [ -n "$node_processes" ]; then
        log_warning "发现残留的Node.js进程，正在清理..."
        echo "$node_processes" | xargs kill 2>/dev/null || true
    fi
    
    local vite_processes=$(pgrep -f "vite" 2>/dev/null || true)
    if [ -n "$vite_processes" ]; then
        log_warning "发现残留的Vite进程，正在清理..."
        echo "$vite_processes" | xargs kill 2>/dev/null || true
    fi
    
    echo
    log_success "IoT系统已完全停止"
    
    # 显示端口状态
    if command -v netstat >/dev/null 2>&1; then
        echo
        log_info "检查端口释放情况:"
        local port_3000=$(netstat -tlnp 2>/dev/null | grep :3000 || true)
        local port_3003=$(netstat -tlnp 2>/dev/null | grep :3003 || true)
        
        if [ -z "$port_3000" ]; then
            echo -e "  端口 3000: ${GREEN}已释放${NC}"
        else
            echo -e "  端口 3000: ${RED}仍被占用${NC}"
        fi
        
        if [ -z "$port_3003" ]; then
            echo -e "  端口 3003: ${GREEN}已释放${NC}"
        else
            echo -e "  端口 3003: ${RED}仍被占用${NC}"
        fi
    fi
}

# 执行主函数
main "$@"