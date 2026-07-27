#!/bin/bash

# IoT系统快速启动停止脚本
# 用于管理前端和后端服务的启动、停止、重启和状态检查

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

# 启动后端服务
start_backend() {
    log_info "启动后端服务..."
    
    local backend_pid_file="$LOGS_DIR/backend.pid"
    
    if check_process "$backend_pid_file"; then
        log_warning "后端服务已在运行 (PID: $(cat "$backend_pid_file"))"
        return 0
    fi
    
    cd "$BACKEND_DIR"
    
    # 检查依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装后端依赖..."
        npm install
    fi
    
    # 启动后端服务
    nohup npm start > "$LOGS_DIR/backend.log" 2>&1 &
    local backend_pid=$!
    echo $backend_pid > "$backend_pid_file"
    
    # 等待服务启动
    sleep 3
    
    if check_process "$backend_pid_file"; then
        log_success "后端服务启动成功 (PID: $backend_pid)"
    else
        log_error "后端服务启动失败"
        return 1
    fi
}

# 启动前端服务
start_frontend() {
    log_info "启动前端服务..."
    
    local frontend_pid_file="$LOGS_DIR/frontend.pid"
    
    if check_process "$frontend_pid_file"; then
        log_warning "前端服务已在运行 (PID: $(cat "$frontend_pid_file"))"
        return 0
    fi
    
    cd "$FRONTEND_DIR"
    
    # 检查依赖
    if [ ! -d "node_modules" ]; then
        log_info "安装前端依赖..."
        npm install
    fi
    
    # 清理Vite缓存以避免权限问题
    if [ -d "node_modules/.vite" ]; then
        log_info "清理Vite缓存..."
        rm -rf node_modules/.vite 2>/dev/null || {
            log_warning "无法删除Vite缓存，尝试使用sudo权限..."
            sudo rm -rf node_modules/.vite 2>/dev/null || {
                log_warning "清理缓存失败，继续启动..."
            }
        }
    fi
    
    # 启动前端开发服务器
    nohup npm run dev > "$LOGS_DIR/frontend.log" 2>&1 &
    local frontend_pid=$!
    echo $frontend_pid > "$frontend_pid_file"
    
    # 等待服务启动
    sleep 5
    
    if check_process "$frontend_pid_file"; then
        log_success "前端服务启动成功 (PID: $frontend_pid)"
        
        # 检查服务是否真正可用
        local count=0
        while [ $count -lt 10 ]; do
            if curl -s --max-time 3 "http://localhost:3000" >/dev/null 2>&1 || \
               curl -s --max-time 3 "http://localhost:3012" >/dev/null 2>&1 || \
               curl -s --max-time 3 "http://localhost:3013" >/dev/null 2>&1; then
                log_success "前端服务已可访问"
                return 0
            fi
            sleep 2
            count=$((count + 1))
        done
        
        log_warning "前端服务已启动但可能仍在初始化中"
        return 0
    else
        log_error "前端服务启动失败"
        # 显示错误日志
        if [ -f "$LOGS_DIR/frontend.log" ]; then
            log_error "错误日志:"
            tail -10 "$LOGS_DIR/frontend.log"
        fi
        return 1
    fi
}

# 停止后端服务
stop_backend() {
    log_info "停止后端服务..."
    
    local backend_pid_file="$LOGS_DIR/backend.pid"
    local stopped=false
    
    # 首先尝试通过PID文件停止
    if check_process "$backend_pid_file"; then
        local pid=$(cat "$backend_pid_file")
        kill "$pid" 2>/dev/null || true
        
        # 等待进程结束
        local count=0
        while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done
        
        # 如果进程仍在运行，强制杀死
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        rm -f "$backend_pid_file"
        stopped=true
    fi
    
    # 额外检查并停止所有相关的node进程
    local node_pids=$(ps aux | grep "node app.js" | grep -v grep | awk '{print $2}' || true)
    if [ -n "$node_pids" ]; then
        for node_pid in $node_pids; do
            # 检查进程是否需要sudo权限
            if kill -0 "$node_pid" 2>/dev/null; then
                kill "$node_pid" 2>/dev/null || true
            else
                # 如果没有权限，尝试使用sudo
                sudo kill "$node_pid" 2>/dev/null || true
            fi
            sleep 1
            # 如果进程仍在运行，强制杀死
            if kill -0 "$node_pid" 2>/dev/null; then
                kill -9 "$node_pid" 2>/dev/null || sudo kill -9 "$node_pid" 2>/dev/null || true
            fi
        done
        stopped=true
    fi
    
    # 检查端口是否仍被占用
    if command -v ss >/dev/null 2>&1; then
        # 使用更可靠的方法查找占用端口的进程
        local port_check=$(ss -tulpn | grep :3003 || true)
        if [ -n "$port_check" ]; then
            # 尝试使用fuser命令查找并杀死占用端口的进程
            if command -v fuser >/dev/null 2>&1; then
                fuser -k 3003/tcp 2>/dev/null || true
                stopped=true
            else
                # 如果没有fuser，尝试查找所有node进程并检查端口
                local all_node_pids=$(ps aux | grep "node.*app\.js" | grep -v grep | awk '{print $2}' || true)
                for pid in $all_node_pids; do
                    if [ -n "$pid" ]; then
                        kill "$pid" 2>/dev/null || true
                        sleep 1
                        if kill -0 "$pid" 2>/dev/null; then
                            kill -9 "$pid" 2>/dev/null || true
                        fi
                    fi
                done
                stopped=true
            fi
        fi
    fi
    
    if [ "$stopped" = true ]; then
        log_success "后端服务已停止"
    else
        log_warning "后端服务未运行"
    fi
}

# 停止前端服务
stop_frontend() {
    log_info "停止前端服务..."
    
    local frontend_pid_file="$LOGS_DIR/frontend.pid"
    
    if check_process "$frontend_pid_file"; then
        local pid=$(cat "$frontend_pid_file")
        kill "$pid" 2>/dev/null || true
        
        # 等待进程结束
        local count=0
        while kill -0 "$pid" 2>/dev/null && [ $count -lt 10 ]; do
            sleep 1
            count=$((count + 1))
        done
        
        # 如果进程仍在运行，强制杀死
        if kill -0 "$pid" 2>/dev/null; then
            kill -9 "$pid" 2>/dev/null || true
        fi
        
        rm -f "$frontend_pid_file"
        log_success "前端服务已停止"
    else
        log_warning "前端服务未运行"
    fi
}

# 启动所有服务
start_all() {
    log_info "启动IoT系统..."
    
    # 检查环境
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js 未安装"
        exit 1
    fi
    
    if ! command -v npm >/dev/null 2>&1; then
        log_error "npm 未安装"
        exit 1
    fi
    
    # 启动服务
    start_backend
    start_frontend
    
    echo
    log_success "IoT系统启动完成！"
    echo
    echo "访问地址:"
    echo "  前端应用: http://localhost:3000"
    echo "  后端API: http://localhost:3003"
    echo "  健康检查: http://localhost:3003/api/health"
    echo
}

# 停止所有服务
stop_all() {
    log_info "停止IoT系统..."
    
    stop_frontend
    stop_backend
    
    log_success "IoT系统已停止"
}

# 重启所有服务
restart_all() {
    log_info "重启IoT系统..."
    
    stop_all
    sleep 2
    start_all
}

# 检查服务状态
check_status() {
    echo "IoT系统服务状态:"
    echo "=================="
    
    # 检查后端
    local backend_pid_file="$LOGS_DIR/backend.pid"
    if check_process "$backend_pid_file"; then
        echo -e "后端服务: ${GREEN}运行中${NC} (PID: $(cat "$backend_pid_file"))"
    else
        echo -e "后端服务: ${RED}未运行${NC}"
    fi
    
    # 检查前端
    local frontend_pid_file="$LOGS_DIR/frontend.pid"
    if check_process "$frontend_pid_file"; then
        echo -e "前端服务: ${GREEN}运行中${NC} (PID: $(cat "$frontend_pid_file"))"
    else
        echo -e "前端服务: ${RED}未运行${NC}"
    fi
    
    echo
    
    # 检查端口占用
    echo "端口占用情况:"
    echo "============"
    
    if command -v netstat >/dev/null 2>&1; then
        echo "端口 3000 (前端):"
        netstat -tlnp 2>/dev/null | grep :3000 || echo "  未占用"
        echo "端口 3003 (后端):"
        netstat -tlnp 2>/dev/null | grep :3003 || echo "  未占用"
    else
        echo "netstat 命令不可用，无法检查端口占用"
    fi
}

# 显示帮助信息
show_help() {
    echo "IoT系统快速启动停止脚本"
    echo "========================"
    echo
    echo "用法: $0 [命令]"
    echo
    echo "命令:"
    echo "  start     启动所有服务 (默认)"
    echo "  stop      停止所有服务"
    echo "  restart   重启所有服务"
    echo "  status    查看服务状态"
    echo "  help      显示帮助信息"
    echo
    echo "示例:"
    echo "  $0 start    # 启动系统"
    echo "  $0 stop     # 停止系统"
    echo "  $0 status   # 查看状态"
    echo
}

# 主函数
main() {
    case "${1:-start}" in
        start)
            start_all
            ;;
        stop)
            stop_all
            ;;
        restart)
            restart_all
            ;;
        status)
            check_status
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