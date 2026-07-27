# 厂商管理数据库说明

本文档说明如何为IoT设备管理系统初始化厂商管理功能所需的数据库表和数据。

## 📋 概述

厂商管理功能包含以下数据库组件：

- **manufacturers表**: 存储厂商基本信息
- **device_types表更新**: 添加厂商外键关联
- **示例数据**: 预置常见厂商信息

## 🗃️ 数据库表结构

### manufacturers表

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | UUID | 主键 | PRIMARY KEY |
| code | VARCHAR(20) | 厂商编码 | UNIQUE, 英文字母≥4位 |
| name | VARCHAR(255) | 厂商名称 | NOT NULL |
| contact | VARCHAR(100) | 联系人 | - |
| phone | VARCHAR(20) | 联系电话 | - |
| email | VARCHAR(255) | 邮箱 | - |
| address | TEXT | 地址 | - |
| website | VARCHAR(255) | 官网 | - |
| description | TEXT | 描述 | - |
| logo_url | VARCHAR(500) | Logo URL | - |
| status | VARCHAR(20) | 状态 | active/inactive |
| created_by | UUID | 创建人 | - |
| created_at | TIMESTAMP | 创建时间 | DEFAULT NOW() |
| updated_at | TIMESTAMP | 更新时间 | AUTO UPDATE |

### device_types表更新

- 添加 `manufacturer_id` 字段，关联 `manufacturers.id`
- 保留原有 `manufacturer` 字段作为备份
- 自动迁移现有厂商数据

## 🚀 快速开始

### 方法一：使用自动化脚本（推荐）

```bash
# 确保在项目根目录
cd /path/to/iot

# 运行初始化脚本
./init-manufacturers-db.sh
```

### 方法二：手动执行SQL

```bash
# 进入SQL目录
cd backend/sql

# 连接数据库并执行初始化脚本
# 数据库初始化脚本已删除
```

### 方法三：逐步执行

```bash
# 1. 创建厂商表
psql "$DB_URL" -f backend/sql/11_create_manufacturers_table.sql

# 2. 更新设备类型表关联
psql "$DB_URL" -f backend/sql/12_update_device_types_manufacturer_fk.sql
```

## ⚙️ 环境配置

确保 `.env` 文件包含正确的数据库连接信息：

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iot_db
DB_USER=your_username
DB_PASSWORD=your_password
```

## 📊 预置数据

初始化脚本会自动创建以下厂商数据：

| 编码 | 厂商名称 | 状态 |
|------|----------|------|
| HUAWEI | 华为技术有限公司 | 启用 |
| XIAOMI | 小米科技有限责任公司 | 启用 |
| HIKVISION | 海康威视数字技术股份有限公司 | 启用 |
| DAHUA | 浙江大华技术股份有限公司 | 启用 |
| TPLINK | TP-Link技术有限公司 | 启用 |

## 🔍 验证安装

### 检查表是否创建成功

```sql
-- 检查厂商表
SELECT COUNT(*) FROM manufacturers;

-- 查看厂商数据
SELECT code, name, status FROM manufacturers ORDER BY created_at;

-- 检查设备类型关联
SELECT 
    dt.name as device_type,
    dt.model,
    m.name as manufacturer_name,
    m.code as manufacturer_code
FROM device_types dt
LEFT JOIN manufacturers m ON dt.manufacturer_id = m.id
LIMIT 10;
```

### 检查约束是否生效

```sql
-- 测试厂商编码格式约束（应该失败）
INSERT INTO manufacturers (code, name) VALUES ('123', '测试厂商'); -- 应该报错

-- 测试正确格式（应该成功）
INSERT INTO manufacturers (code, name) VALUES ('TEST', '测试厂商'); -- 应该成功
```

## 🔧 故障排除

### 常见问题

1. **权限错误**
   ```bash
   chmod +x init-manufacturers-db.sh
   ```

2. **数据库连接失败**
   - 检查 `.env` 文件配置
   - 确认数据库服务运行状态
   - 验证用户权限

3. **表已存在错误**
   - 脚本使用 `IF NOT EXISTS`，可以安全重复执行
   - 如需重置，先删除相关表

4. **外键约束错误**
   - 确保先执行基础表创建脚本
   - 检查数据完整性

### 日志查看

```bash
# 查看详细执行日志
./init-manufacturers-db.sh 2>&1 | tee manufacturers-init.log
```

## 📝 数据迁移说明

如果系统中已有设备类型数据，初始化脚本会：

1. 自动匹配现有厂商名称到新的厂商表
2. 为未匹配的厂商自动创建记录
3. 生成符合规范的厂商编码
4. 保留原始数据作为备份

## 🔄 回滚操作

如需回滚更改：

```sql
-- 删除厂商表
DROP TABLE IF EXISTS manufacturers CASCADE;

-- 删除设备类型表的厂商ID字段
ALTER TABLE device_types DROP COLUMN IF EXISTS manufacturer_id;
```

## 📞 技术支持

如遇到问题，请检查：

1. PostgreSQL版本兼容性（推荐12+）
2. 数据库用户权限
3. 网络连接状态
4. 磁盘空间充足

---

**注意**: 在生产环境中执行前，请先在测试环境中验证所有脚本。