# 设备管理指南

## 概述

为了避免每次服务重启时自动添加默认设备，系统已配置为手动添加设备模式。这样可以确保您添加的设备在服务重启后不会消失。

## 配置变更说明

### 1. Docker 配置变更
- 已注释掉 `docker-compose.yml` 中的自动SQL初始化配置
- PostgreSQL容器启动时不再自动执行SQL文件
- 避免每次重启都插入默认的演示设备

### 2. 本地启动配置变更
- 修改了 `run.sh` 脚本中的数据库初始化逻辑
- 默认跳过数据库初始化，避免重复插入数据
- 如需强制初始化，可设置环境变量 `FORCE_DB_INIT=true`

## 手动添加设备

### 方法一：通过Web界面添加
1. 访问前端系统：http://localhost:3001
2. 登录系统（默认用户名：admin，密码：admin123）
3. 进入设备管理页面
4. 点击"添加设备"按钮
5. 填写设备信息：
   - 设备ID（唯一标识）
   - 设备名称
   - 设备类型
   - 位置信息
   - 其他配置参数
6. 保存设备信息

### 方法二：通过API添加
```bash
# 添加设备的API调用示例
curl -X POST http://localhost:3003/api/devices \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "device_id": "your_device_id",
    "name": "设备名称",
    "device_type_id": "设备类型ID",
    "location": "设备位置",
    "description": "设备描述"
  }'
```

## 数据库管理

### 手动初始化数据库
如果需要重新初始化数据库（仅创建表结构，不插入演示设备）：

```bash
# 方法一：使用环境变量强制初始化
FORCE_DB_INIT=true ./run.sh

# 方法二：直接运行初始化脚本
cd backend
node scripts/simple-init-db.js
```

### 清理演示数据
如果系统中已存在不需要的演示设备，可以通过以下方式清理：

```sql
-- 连接到数据库
psql -h localhost -U postgres -d iot_device_management

-- 删除所有设备数据（谨慎操作）
DELETE FROM device_data;
DELETE FROM devices;

-- 或者只删除特定的演示设备
DELETE FROM devices WHERE device_id LIKE 'DEMO_%';
DELETE FROM devices WHERE device_id IN ('869080075378986', '869080075361420');
```

## 设备持久化说明

### 数据存储位置
- 设备数据存储在PostgreSQL数据库中
- Docker方式：数据存储在Docker卷 `postgres_data` 中
- 本地方式：数据存储在本地PostgreSQL实例中

### 数据持久化保证
1. **Docker方式**：只要不删除Docker卷，数据就会持久保存
2. **本地方式**：数据存储在本地数据库中，重启服务不会影响数据

### 备份建议
```bash
# 备份数据库
pg_dump -h localhost -U postgres iot_device_management > backup.sql

# 恢复数据库
psql -h localhost -U postgres iot_device_management < backup.sql
```

## 故障排除

### 设备添加后消失
如果遇到设备添加后重启消失的问题，请检查：

1. **确认配置变更已生效**：
   ```bash
   # 检查docker-compose.yml中的SQL初始化是否已注释
   grep -n "docker-entrypoint-initdb.d" docker-compose.yml
   ```

2. **检查数据库连接**：
   ```bash
   # 测试数据库连接
   psql -h localhost -U postgres -d iot_device_management -c "SELECT COUNT(*) FROM devices;"
   ```

3. **查看服务日志**：
   ```bash
   # Docker方式
   docker-compose logs backend
   
   # 本地方式
   tail -f logs/backend.log
   ```

### 重新启用演示数据（如需要）
如果需要重新启用演示数据：

1. 取消注释 `docker-compose.yml` 中的SQL初始化配置
2. 或者手动执行SQL文件：
   ```bash
   psql -h localhost -U postgres iot_device_management < database/sql/03_insert_default_data.sql
   ```

## 联系支持

如果遇到问题，请检查：
1. 系统日志文件
2. 数据库连接状态
3. 网络配置
4. 权限设置

更多技术支持，请参考项目文档或联系开发团队。