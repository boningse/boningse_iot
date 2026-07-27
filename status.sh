#!/bin/bash

# IoT系统状态检查脚本
# 快速查看IoT系统各服务的运行状态

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
PIDS_DIR="$SCRIPT_DIR/pids"
LOGS_DIR="$SCRIPT_DIR/logs"

# 检查进程是否运行
check_process() {
    local pid_file="$1"
    if [ -f "$pid_file" ]; then
        local pid=$(cat "$pid_file")
        if kill -0 "$pid" 2>/dev/null; then
            echo "$pid"
            return 0
        else
            rm -f "$pid_file"
            return 1
        fi
    fi
    return 1
}

# 获取进程运行时间
get_process_uptime() {
    local pid="$1"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        if command -v ps >/dev/null 2>&1; then
            ps -o etime= -p "$pid" 2>/dev/null | tr -d ' ' || echo "未知"
        else
            echo "未知"
        fi
    else
        echo "未运行"
    fi
}

# 获取进程内存使用
get_process_memory() {
    local pid="$1"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        if command -v ps >/dev/null 2>&1; then
            ps -o rss= -p "$pid" 2>/dev/null | awk '{printf "%.1f MB", $1/1024}' || echo "未知"
        else
            echo "未知"
        fi
    else
        echo "0 MB"
    fi
}

# 检查端口状态
check_port() {
    local port="$1"
    local service_name="$2"
    
    if command -v netstat >/dev/null 2>&1; then
        local port_info=$(netstat -tlnp 2>/dev/null | grep ":$port ")
        if [ -n "$port_info" ]; then
            echo -e "  端口 $port ($service_name): ${GREEN}监听中${NC}"
            echo "    $port_info" | sed 's/^/    /'
        else
            echo -e "  端口 $port ($service_name): ${RED}未监听${NC}"
        fi
    elif command -v ss >/dev/null 2>&1; then
        local port_info=$(ss -tlnp 2>/dev/null | grep ":$port ")
        if [ -n "$port_info" ]; then
            echo -e "  端口 $port ($service_name): ${GREEN}监听中${NC}"
            echo "    $port_info" | sed 's/^/    /'
        else
            echo -e "  端口 $port ($service_name): ${RED}未监听${NC}"
        fi
    else
        echo -e "  端口 $port ($service_name): ${YELLOW}无法检查${NC} (缺少netstat/ss命令)"
    fi
}

# 检查服务健康状态
check_service_health() {
    local service_url="$1"
    local service_name="$2"
    
    if command -v curl >/dev/null 2>&1; then
        local response=$(curl -s -o /dev/null -w "%{http_code}" "$service_url" 2>/dev/null || echo "000")
        if [ "$response" = "200" ]; then
            echo -e "  $service_name 健康检查: ${GREEN}正常${NC} (HTTP $response)"
        elif [ "$response" = "000" ]; then
            echo -e "  $service_name 健康检查: ${RED}无法连接${NC}"
        else
            echo -e "  $service_name 健康检查: ${YELLOW}异常${NC} (HTTP $response)"
        fi
    else
        echo -e "  $service_name 健康检查: ${YELLOW}无法检查${NC} (缺少curl命令)"
    fi
}

# 显示日志文件状态
show_log_status() {
    echo -e "\n${CYAN}日志文件状态:${NC}"
    echo "============"
    
    for log_file in "backend.log" "frontend.log"; do
        local log_path="$LOGS_DIR/$log_file"
        if [ -f "$log_path" ]; then
            local size=$(du -h "$log_path" 2>/dev/null | cut -f1)
            local modified=$(stat -c %y "$log_path" 2>/dev/null | cut -d' ' -f1,2 | cut -d'.' -f1 || echo "未知")
            echo -e "  $log_file: ${GREEN}存在${NC} (大小: $size, 修改时间: $modified)"
            
            # 显示最后几行错误日志
            local error_count=$(grep -i "error\|exception\|failed" "$log_path" 2>/dev/null | tail -3 | wc -l)
            if [ "$error_count" -gt 0 ]; then
                echo -e "    ${YELLOW}最近错误 ($error_count 条):${NC}"
                grep -i "error\|exception\|failed" "$log_path" 2>/dev/null | tail -3 | sed 's/^/      /'
            fi
        else
            echo -e "  $log_file: ${RED}不存在${NC}"
        fi
    done
}

# 主函数
main() {
    echo -e "${BLUE}IoT系统状态报告${NC}"
    echo "=================="
    echo "检查时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo
    
    # 检查服务状态
    echo -e "${CYAN}服务运行状态:${NC}"
    echo "============"
    
    # 检查后端服务
    local backend_pid_file="$LOGS_DIR/backend.pid"
    local backend_pid=$(check_process "$backend_pid_file" 2>/dev/null || echo "")
    if [ -n "$backend_pid" ]; then
        local uptime=$(get_process_uptime "$backend_pid")
        local memory=$(get_process_memory "$backend_pid")
        echo -e "  后端服务: ${GREEN}运行中${NC} (PID: $backend_pid, 运行时间: $uptime, 内存: $memory)"
    else
        echo -e "  后端服务: ${RED}未运行${NC}"
    fi
    
    # 检查前端服务
    local frontend_pid_file="$LOGS_DIR/frontend.pid"
    local frontend_pid=$(check_process "$frontend_pid_file" 2>/dev/null || echo "")
    if [ -n "$frontend_pid" ]; then
        local uptime=$(get_process_uptime "$frontend_pid")
        local memory=$(get_process_memory "$frontend_pid")
        echo -e "  前端服务: ${GREEN}运行中${NC} (PID: $frontend_pid, 运行时间: $uptime, 内存: $memory)"
    else
        echo -e "  前端服务: ${RED}未运行${NC}"
    fi
    
    # 检查端口状态
    echo
    echo -e "${CYAN}端口监听状态:${NC}"
    echo "============"
    check_port "3000" "前端"
    check_port "3003" "后端"
    
    # 检查服务健康状态
    echo
    echo -e "${CYAN}服务健康检查:${NC}"
    echo "============"
    check_service_health "http://localhost:3003/health" "后端API"
    check_service_health "http://localhost:3000" "前端应用"
    
    # 显示访问地址
    echo
    echo -e "${CYAN}访问地址:${NC}"
    echo "========"
    echo "  前端应用: http://localhost:3000"
    echo "  后端API: http://localhost:3003"
    echo "  健康检查: http://localhost:3003/health"
    
    # 显示日志状态
    show_log_status
    
    # 系统资源使用情况
    echo
    echo -e "${CYAN}系统资源:${NC}"
    echo "========"
    
    if command -v free >/dev/null 2>&1; then
        echo "  内存使用:"
        free -h | grep -E "Mem:|Swap:" | sed 's/^/    /'
    fi
    
    if command -v df >/dev/null 2>&1; then
        echo "  磁盘使用:"
        df -h "$SCRIPT_DIR" | tail -1 | awk '{print "    项目目录: " $5 " 已使用 (" $3 "/" $2 ")"}'
    fi
    
    # 快速操作提示
    echo
    echo -e "${CYAN}快速操作:${NC}"
    echo "========"
    echo "  启动系统: ./quick-start.sh start"
    echo "  停止系统: ./stop.sh"
    echo "  重启系统: ./quick-start.sh restart"
    echo "  查看日志: tail -f logs/backend.log"
    echo "  查看日志: tail -f logs/frontend.log"
}

# 执行主函数
main "$@"