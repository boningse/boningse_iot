#!/bin/bash

# IoT设备管理系统备份脚本
# 创建时间: $(date '+%Y-%m-%d %H:%M:%S')

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置变量
PROJECT_DIR="/mnt/mydisk/iot"
BACKUP_BASE_DIR="/mnt/mydisk/iot/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
BACKUP_NAME="iot_backup_${TIMESTAMP}"
BACKUP_DIR="${BACKUP_BASE_DIR}/${BACKUP_NAME}"
COMPRESSED_BACKUP="${BACKUP_BASE_DIR}/${BACKUP_NAME}.tar.gz"

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

# 检查必要工具
check_dependencies() {
    log_info "检查必要工具..."
    
    local missing_tools=()
    
    if ! command -v tar &> /dev/null; then
        missing_tools+=("tar")
    fi
    
    if ! command -v gzip &> /dev/null; then
        missing_tools+=("gzip")
    fi
    
    if ! command -v pg_dump &> /dev/null; then
        log_warning "pg_dump 未找到，将跳过数据库备份"
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "缺少必要工具: ${missing_tools[*]}"
        log_error "请安装缺少的工具后重试"
        exit 1
    fi
    
    log_success "所有必要工具已就绪"
}

# 创建备份目录
create_backup_dir() {
    log_info "创建备份目录: ${BACKUP_DIR}"
    
    if [ ! -d "${BACKUP_BASE_DIR}" ]; then
        mkdir -p "${BACKUP_BASE_DIR}"
        log_info "创建备份根目录: ${BACKUP_BASE_DIR}"
    fi
    
    mkdir -p "${BACKUP_DIR}"
    log_success "备份目录创建成功"
}

# 备份项目文件
backup_project_files() {
    log_info "备份项目文件..."
    
    # 排除不需要备份的文件和目录
    local exclude_patterns=(
        "--exclude=node_modules"
        "--exclude=.git"
        "--exclude=backend/logs/*.log"
        "--exclude=backend/logs/*.log.*"
        "--exclude=*.tmp"
        "--exclude=*.temp"
        "--exclude=.DS_Store"
        "--exclude=Thumbs.db"
        "--exclude=dist"
        "--exclude=build"
        "--exclude=coverage"
        "--exclude=.nyc_output"
        "--exclude=.vscode"
        "--exclude=.idea"
    )
    
    # 复制项目文件
    rsync -av "${exclude_patterns[@]}" "${PROJECT_DIR}/" "${BACKUP_DIR}/project/"
    
    log_success "项目文件备份完成"
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    
    if ! command -v pg_dump &> /dev/null; then
        log_warning "pg_dump 未找到，跳过数据库备份"
        return 0
    fi
    
    # 从环境变量或配置文件读取数据库连接信息
    local db_host="${DB_HOST:-localhost}"
    local db_port="${DB_PORT:-5432}"
    local db_name="${DB_NAME:-iot_platform}"
    local db_user="${DB_USER:-postgres}"
    
    # 创建数据库备份目录
    mkdir -p "${BACKUP_DIR}/database"
    
    # 备份数据库结构和数据
    if PGPASSWORD="${DB_PASSWORD}" pg_dump -h "${db_host}" -p "${db_port}" -U "${db_user}" -d "${db_name}" > "${BACKUP_DIR}/database/database_full_${TIMESTAMP}.sql" 2>/dev/null; then
        log_success "数据库完整备份完成"
    else
        log_warning "数据库备份失败，可能是连接问题或权限不足"
    fi
    
    # 备份仅结构
    if PGPASSWORD="${DB_PASSWORD}" pg_dump -h "${db_host}" -p "${db_port}" -U "${db_user}" -d "${db_name}" --schema-only > "${BACKUP_DIR}/database/database_schema_${TIMESTAMP}.sql" 2>/dev/null; then
        log_success "数据库结构备份完成"
    else
        log_warning "数据库结构备份失败"
    fi
}

# 创建备份信息文件
create_backup_info() {
    log_info "创建备份信息文件..."
    
    cat > "${BACKUP_DIR}/backup_info.txt" << EOF
IoT设备管理系统备份信息
========================

备份时间: $(date '+%Y-%m-%d %H:%M:%S')
备份名称: ${BACKUP_NAME}
项目路径: ${PROJECT_DIR}
备份路径: ${BACKUP_DIR}

系统信息:
- 操作系统: $(uname -s)
- 内核版本: $(uname -r)
- 主机名: $(hostname)
- 用户: $(whoami)

项目信息:
- Node.js版本: $(node --version 2>/dev/null || echo "未安装")
- npm版本: $(npm --version 2>/dev/null || echo "未安装")
- Docker版本: $(docker --version 2>/dev/null || echo "未安装")
- PostgreSQL客户端版本: $(psql --version 2>/dev/null || echo "未安装")

备份内容:
- 项目源代码
- 配置文件
- SQL脚本
- 文档文件
- Docker配置
- 部署脚本
$([ -f "${BACKUP_DIR}/database/database_full_${TIMESTAMP}.sql" ] && echo "- 数据库完整备份" || echo "- 数据库备份: 跳过")
$([ -f "${BACKUP_DIR}/database/database_schema_${TIMESTAMP}.sql" ] && echo "- 数据库结构备份" || echo "- 数据库结构备份: 跳过")

恢复说明:
1. 解压备份文件到目标目录
2. 进入项目目录: cd project/
3. 安装依赖: npm install
4. 配置环境变量: 复制并编辑 .env 文件
5. 恢复数据库: psql -U username -d database_name < database/database_full_${TIMESTAMP}.sql
6. 启动服务: npm start 或 docker-compose up

注意事项:
- 恢复前请确保目标环境已安装必要的依赖
- 数据库恢复前请确保目标数据库已创建
- 请根据实际环境调整配置文件
EOF
    
    log_success "备份信息文件创建完成"
}

# 压缩备份
compress_backup() {
    log_info "压缩备份文件..."
    
    cd "${BACKUP_BASE_DIR}"
    tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}"
    
    # 计算文件大小
    local backup_size=$(du -h "${COMPRESSED_BACKUP}" | cut -f1)
    
    log_success "备份压缩完成: ${COMPRESSED_BACKUP} (${backup_size})"
    
    # 询问是否删除未压缩的备份目录
    echo
    read -p "是否删除未压缩的备份目录? [y/N]: " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "${BACKUP_DIR}"
        log_success "未压缩的备份目录已删除"
    else
        log_info "保留未压缩的备份目录: ${BACKUP_DIR}"
    fi
}

# 清理旧备份
cleanup_old_backups() {
    log_info "清理旧备份..."
    
    # 保留最近的5个备份
    local keep_count=5
    local backup_files=($(ls -t "${BACKUP_BASE_DIR}"/iot_backup_*.tar.gz 2>/dev/null || true))
    
    if [ ${#backup_files[@]} -gt $keep_count ]; then
        log_info "发现 ${#backup_files[@]} 个备份文件，保留最近的 ${keep_count} 个"
        
        for ((i=$keep_count; i<${#backup_files[@]}; i++)); do
            local old_backup="${backup_files[$i]}"
            log_info "删除旧备份: $(basename "$old_backup")"
            rm -f "$old_backup"
        done
        
        log_success "旧备份清理完成"
    else
        log_info "备份文件数量未超过限制，无需清理"
    fi
}

# 显示备份结果
show_backup_result() {
    echo
    echo "======================================"
    log_success "备份完成!"
    echo "======================================"
    echo
    echo "备份信息:"
    echo "  备份名称: ${BACKUP_NAME}"
    echo "  压缩文件: ${COMPRESSED_BACKUP}"
    echo "  文件大小: $(du -h "${COMPRESSED_BACKUP}" | cut -f1)"
    echo "  创建时间: $(date '+%Y-%m-%d %H:%M:%S')"
    echo
    echo "恢复命令:"
    echo "  tar -xzf ${COMPRESSED_BACKUP} -C /path/to/restore/"
    echo
    echo "备份位置:"
    echo "  ${COMPRESSED_BACKUP}"
    echo
}

# 主函数
main() {
    echo "======================================"
    echo "    IoT设备管理系统备份工具"
    echo "======================================"
    echo
    
    # 检查项目目录
    if [ ! -d "${PROJECT_DIR}" ]; then
        log_error "项目目录不存在: ${PROJECT_DIR}"
        exit 1
    fi
    
    # 加载环境变量
    if [ -f "${PROJECT_DIR}/.env" ]; then
        log_info "加载环境变量文件"
        set -a
        source "${PROJECT_DIR}/.env"
        set +a
    fi
    
    # 执行备份步骤
    check_dependencies
    create_backup_dir
    backup_project_files
    backup_database
    create_backup_info
    compress_backup
    cleanup_old_backups
    show_backup_result
    
    log_success "所有备份操作完成!"
}

# 错误处理
trap 'log_error "备份过程中发生错误，退出码: $?"' ERR

# 执行主函数
main "$@"