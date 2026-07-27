#!/bin/bash

# 创建IoT系统部署包脚本
# 用于在无法SSH连接时创建本地部署包

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# 配置变量
PACKAGE_NAME="iot-deployment-$(date +%Y%m%d_%H%M%S)"
PACKAGE_DIR="$PACKAGE_NAME"
TAR_FILE="$PACKAGE_NAME.tar.gz"

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

# 创建部署包
create_package() {
    log_info "创建部署包目录: $PACKAGE_DIR"
    
    # 创建包目录
    mkdir -p "$PACKAGE_DIR"
    
    # 复制项目文件
    log_info "复制项目文件..."
    rsync -av --exclude='node_modules' \
              --exclude='.git' \
              --exclude='logs' \
              --exclude='pids' \
              --exclude='*.log' \
              --exclude='backups' \
              --exclude='deploy_backup_*' \
              --exclude='*.tar.gz' \
              --exclude="$PACKAGE_NAME" \
              ./ "$PACKAGE_DIR/"
    
    # 备份数据库
    backup_database
    
    # 创建部署脚本
    create_deployment_scripts
    
    # 创建配置文件
    create_config_files
    
    # 创建说明文档
    create_readme
    
    log_success "部署包创建完成"
}

# 备份数据库
backup_database() {
    log_info "备份数据库..."
    
    # 读取数据库配置
    if [ -f "backend/.env" ]; then
        source backend/.env
    fi
    
    DB_HOST=${DB_HOST:-localhost}
    DB_PORT=${DB_PORT:-5432}
    DB_NAME=${DB_NAME:-iot_device_management}
    DB_USER=${DB_USER:-postgres}
    DB_PASSWORD=${DB_PASSWORD:-123456}
    
    # 设置PostgreSQL密码环境变量
    export PGPASSWORD="$DB_PASSWORD"
    
    # 创建数据库备份
    if pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" > "$PACKAGE_DIR/database_backup.sql" 2>/dev/null; then
        log_success "数据库备份完成"
    else
        log_warning "数据库备份失败，将创建初始化脚本"
        # 创建数据库初始化脚本
        cp setup-remote-database.sh "$PACKAGE_DIR/"
    fi
    
    unset PGPASSWORD
}

# 创建部署脚本
create_deployment_scripts() {
    log_info "创建部署脚本..."
    
    # 创建服务器端部署脚本
    cat > "$PACKAGE_DIR/deploy.sh" << 'EOF'
#!/bin/bash

# IoT系统服务器端部署脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# 配置变量
DEPLOY_PATH="/home/bnse/iot"
BACKUP_PATH="/home/bnse/iot_backup_$(date +%Y%m%d_%H%M%S)"

# 检查系统环境
check_system() {
    log_info "检查系统环境..."
    
    # 检查Node.js
    if ! command -v node >/dev/null 2>&1; then
        log_info "安装Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
    
    # 检查PostgreSQL
    if ! command -v psql >/dev/null 2>&1; then
        log_info "安装PostgreSQL..."
        sudo apt-get update
        sudo apt-get install -y postgresql postgresql-contrib
        sudo systemctl start postgresql
        sudo systemctl enable postgresql
    fi
    
    log_success "系统环境检查完成"
}

# 备份现有系统
backup_existing() {
    if [ -d "$DEPLOY_PATH" ]; then
        log_info "备份现有系统到 $BACKUP_PATH"
        mv "$DEPLOY_PATH" "$BACKUP_PATH"
    fi
}

# 部署新系统
deploy_system() {
    log_info "部署IoT系统到 $DEPLOY_PATH"
    
    # 创建目录
    mkdir -p "$DEPLOY_PATH"
    
    # 复制文件
    cp -r * "$DEPLOY_PATH/"
    
    # 设置权限
    chmod +x "$DEPLOY_PATH/"*.sh
    
    log_success "系统文件部署完成"
}

# 配置数据库
setup_database() {
    log_info "配置数据库..."
    
    # 设置PostgreSQL密码
    sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123456';"
    
    # 创建数据库
    sudo -u postgres createdb iot_device_management 2>/dev/null || echo "数据库已存在"
    
    # 配置认证
    PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oP '\d+\.\d+' | head -1)
    PG_CONFIG_DIR="/etc/postgresql/$PG_VERSION/main"
    
    sudo cp "$PG_CONFIG_DIR/pg_hba.conf" "$PG_CONFIG_DIR/pg_hba.conf.backup" 2>/dev/null || true
    sudo sed -i "s/local   all             postgres                                peer/local   all             postgres                                md5/g" "$PG_CONFIG_DIR/pg_hba.conf"
    sudo sed -i "s/local   all             all                                     peer/local   all             all                                     md5/g" "$PG_CONFIG_DIR/pg_hba.conf"
    
    sudo systemctl restart postgresql
    
    # 恢复数据库
    if [ -f "database_backup.sql" ]; then
        log_info "恢复数据库备份..."
        PGPASSWORD=123456 psql -h localhost -U postgres iot_device_management < database_backup.sql
    else
        log_info "初始化数据库结构..."
        if [ -f "setup-remote-database.sh" ]; then
            ./setup-remote-database.sh init
        fi
    fi
    
    log_success "数据库配置完成"
}

# 安装依赖
install_dependencies() {
    log_info "安装项目依赖..."
    
    cd "$DEPLOY_PATH"
    
    # 安装后端依赖
    cd backend
    npm install --production
    
    # 安装前端依赖
    cd ../frontend
    npm install
    npm run build
    
    cd ..
    
    log_success "依赖安装完成"
}

# 启动服务
start_services() {
    log_info "启动IoT服务..."
    
    cd "$DEPLOY_PATH"
    
    # 创建必要目录
    mkdir -p logs pids
    
    # 启动服务
    ./quick-start.sh start
    
    log_success "服务启动完成"
}

# 主函数
main() {
    log_info "开始IoT系统部署..."
    
    check_system
    backup_existing
    deploy_system
    setup_database
    install_dependencies
    start_services
    
    log_success "IoT系统部署完成！"
    log_info "前端访问地址: http://localhost:3001"
    log_info "后端API地址: http://localhost:3003"
    
    # 显示服务状态
    cd "$DEPLOY_PATH"
    ./quick-start.sh status
}

# 执行主函数
main "$@"
EOF
    
    chmod +x "$PACKAGE_DIR/deploy.sh"
    
    log_success "部署脚本创建完成"
}

# 创建配置文件
create_config_files() {
    log_info "创建配置文件..."
    
    # 创建生产环境配置
    cat > "$PACKAGE_DIR/backend/.env.production" << 'EOF'
# 生产环境配置
NODE_ENV=production
PORT=3003

# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_device_management
DB_USER=postgres
DB_PASSWORD=123456
DB_DIALECT=postgres

# MQTT配置
MQTT_BROKER_URL=mqtt://223.80.108.95:5007
MQTT_USERNAME=boning
MQTT_PASSWORD=BoNing@123
MQTT_CLIENT_ID=iot_backend_server_remote
MQTT_KEEP_ALIVE=60
MQTT_CLEAN_SESSION=true

# JWT配置
JWT_SECRET=remote-super-secret-jwt-key-production-2024
JWT_EXPIRES_IN=24h

# 日志配置
LOG_LEVEL=info
LOG_FILE=logs/app.log

# CORS配置
CORS_ORIGIN=http://111.15.177.66:3001,https://111.15.177.66:3001,*
ALLOWED_ORIGINS=http://111.15.177.66:3001,https://111.15.177.66:3001,http://111.15.177.66:3003,https://111.15.177.66:3003,http://localhost:3001,http://localhost:3003
EOF
    
    # 复制生产配置为默认配置
    cp "$PACKAGE_DIR/backend/.env.production" "$PACKAGE_DIR/backend/.env"
    
    log_success "配置文件创建完成"
}

# 创建说明文档
create_readme() {
    log_info "创建说明文档..."
    
    cat > "$PACKAGE_DIR/README.md" << 'EOF'
# IoT系统部署包

本部署包包含完整的IoT设备管理系统，可在目标服务器上快速部署。

## 📦 包含内容

- 完整的IoT系统源代码
- 数据库备份文件（如果有）
- 自动部署脚本
- 生产环境配置文件
- 部署说明文档

## 🚀 快速部署

### 1. 上传部署包到服务器

```bash
# 使用scp上传（如果SSH可用）
scp iot-deployment-*.tar.gz bnse@111.15.177.66:/home/bnse/

# 或使用其他方式（FTP、U盘等）将文件传输到服务器
```

### 2. 在服务器上解压并部署

```bash
# 登录服务器
ssh bnse@111.15.177.66

# 解压部署包
cd /home/bnse
tar -xzf iot-deployment-*.tar.gz
cd iot-deployment-*/

# 执行部署
sudo ./deploy.sh
```

### 3. 验证部署

```bash
# 检查服务状态
cd /home/bnse/iot
./quick-start.sh status

# 访问系统
# 前端: http://111.15.177.66:3001
# 后端: http://111.15.177.66:3003
```

## 🔧 手动部署步骤

如果自动部署失败，可以按以下步骤手动部署：

### 1. 安装系统依赖

```bash
# 更新系统
sudo apt-get update

# 安装Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 安装PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. 配置数据库

```bash
# 设置PostgreSQL密码
sudo -u postgres psql -c "ALTER USER postgres PASSWORD '123456';"

# 创建数据库
sudo -u postgres createdb iot_device_management

# 配置认证（将peer改为md5）
sudo nano /etc/postgresql/*/main/pg_hba.conf
sudo systemctl restart postgresql

# 恢复数据库（如果有备份）
PGPASSWORD=123456 psql -h localhost -U postgres iot_device_management < database_backup.sql
```

### 3. 部署应用

```bash
# 复制文件到目标目录
sudo mkdir -p /home/bnse/iot
sudo cp -r * /home/bnse/iot/
sudo chown -R bnse:bnse /home/bnse/iot

# 安装依赖
cd /home/bnse/iot/backend
npm install --production

cd ../frontend
npm install
npm run build

# 启动服务
cd ..
./quick-start.sh start
```

## 🔍 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   sudo netstat -tlnp | grep :3001
   sudo kill -9 <PID>
   ```

2. **数据库连接失败**
   ```bash
   sudo systemctl status postgresql
   PGPASSWORD=123456 psql -h localhost -U postgres -l
   ```

3. **权限问题**
   ```bash
   sudo chown -R bnse:bnse /home/bnse/iot
   chmod +x /home/bnse/iot/*.sh
   ```

### 查看日志

```bash
# 应用日志
tail -f /home/bnse/iot/logs/backend.log
tail -f /home/bnse/iot/logs/frontend.log

# 系统日志
sudo journalctl -u postgresql
```

## 📞 技术支持

如果遇到问题，请：
1. 检查日志文件
2. 确认系统环境
3. 验证网络连接
4. 查看防火墙设置

---

**部署时间**: $(date)
**包版本**: $PACKAGE_NAME
EOF
    
    log_success "说明文档创建完成"
}

# 打包文件
package_files() {
    log_info "打包部署文件..."
    
    tar -czf "$TAR_FILE" "$PACKAGE_DIR"
    
    # 计算文件大小
    local size=$(du -h "$TAR_FILE" | cut -f1)
    
    log_success "部署包打包完成: $TAR_FILE (大小: $size)"
}

# 清理临时文件
cleanup() {
    log_info "清理临时文件..."
    
    rm -rf "$PACKAGE_DIR"
    
    log_success "清理完成"
}

# 显示使用说明
show_usage() {
    log_success "部署包创建完成！"
    echo ""
    echo "📦 部署包文件: $TAR_FILE"
    echo ""
    echo "🚀 部署步骤:"
    echo "1. 将 $TAR_FILE 传输到目标服务器 111.15.177.66"
    echo "2. 在服务器上解压: tar -xzf $TAR_FILE"
    echo "3. 进入目录: cd $PACKAGE_NAME"
    echo "4. 执行部署: sudo ./deploy.sh"
    echo ""
    echo "🌐 部署完成后访问地址:"
    echo "   前端: http://111.15.177.66:3001"
    echo "   后端: http://111.15.177.66:3003"
    echo ""
    echo "📖 详细说明请查看部署包中的 README.md 文件"
}

# 主函数
main() {
    log_info "开始创建IoT系统部署包..."
    
    create_package
    package_files
    cleanup
    show_usage
    
    log_success "部署包创建完成！"
}

# 执行主函数
main "$@"