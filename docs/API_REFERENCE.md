# 伯宁云控 API 接口文档

> 对应系统版本：v2.2
> 文档日期：2026-07-26  
> 来源：生产后端实际挂载路由，而非仅依据前端调用代码  
> 用途：Web 前端、第三方系统和微信小程序接入

## 1. 文档范围

当前生产服务实际暴露：

- 169 个唯一 `/api` HTTP 接口。
- 2 个根级运维接口：`/health`、`/metrics`。
- 1 个 WebSocket 端点：`/ws`。
- 所有保留的路由文件均已挂载，无重复声明和测试接口。

## 2. 接入地址

### 2.1 当前局域网

```text
HTTP API: http://192.168.10.155/api
WebSocket: ws://192.168.10.155/ws
健康检查: http://192.168.10.155/health
```

### 2.2 正式外部接入

当前系统正式域名：

```text
Web:       https://bnyk.boningse.com
HTTP API: https://bnyk.boningse.com/api
WebSocket: wss://bnyk.boningse.com/ws
健康检查: https://bnyk.boningse.com/api/system/health
```

微信小程序不能以当前局域网 IP 作为正式生产地址。发布前还需要：

- 在微信公众平台配置 `request`、`uploadFile`、`downloadFile`、`socket` 合法域名。
- 生产环境只开放 443，不直接暴露 PostgreSQL、MQTT 管理端口或 Node.js 端口。

## 3. 通用约定

### 3.1 请求头

除标记为“公开”的接口外，均需携带 JWT：

```http
Authorization: Bearer <accessToken>
Content-Type: application/json
```

### 3.2 通用响应

成功响应通常为：

```json
{
  "success": true,
  "message": "操作成功",
  "data": {}
}
```

失败响应通常为：

```json
{
  "success": false,
  "message": "错误说明",
  "error": "可选的内部错误信息",
  "code": "可选的错误码"
}
```

部分历史接口只返回 `data`，调用端不应假定所有接口都一定包含 `success`。

### 3.3 HTTP 状态码

| 状态码 | 含义 | 调用端处理 |
|---|---|---|
| `200` | 查询或操作成功 | 读取 `data` |
| `201` | 创建成功 | 读取新对象 |
| `400` | 参数或流程状态错误 | 显示 `message` |
| `401` | Token 缺失、失效或过期 | 尝试刷新 Token，失败后重新登录 |
| `403` | 角色、页面权限或数据范围不足 | 禁止操作 |
| `404` | 对象不存在或无权查看 | 返回列表或刷新页面 |
| `409` | 重复数据或状态冲突 | 提示用户重新检查 |
| `429` | 请求过于频繁 | 延迟后重试 |
| `500` | 服务内部错误 | 记录请求 ID 并提示稍后重试 |
| `502` | MQTT 等下游发送失败 | 不应把控制动作显示为成功 |

### 3.4 分页

大多数列表接口使用：

| 参数 | 类型 | 说明 |
|---|---|---|
| `page` | integer | 页码，从 1 开始 |
| `pageSize` | integer | 每页数量 |
| `keyword` / `search` | string | 模糊搜索；不同历史模块字段名不统一 |

典型分页响应：

```json
{
  "data": {
    "list": [],
    "pagination": {
      "total": 0,
      "page": 1,
      "pageSize": 20,
      "totalPages": 0
    }
  }
}
```

### 3.5 时间和标识

- 时间统一按 ISO 8601 传输，例如 `2026-07-26T08:00:00+08:00`。
- 数据库主键通常为 UUID。
- `imei` 同时允许作为设备 ID 使用，不限制长度，可包含数字、字母和大小写。
- `deviceId` 在不同控制接口中可能接受设备 UUID、IMEI 或厂家设备 ID，推荐始终使用设备 UUID。

## 4. 认证、角色与数据范围

### 4.1 角色

| 角色 | 说明 |
|---|---|
| `admin` | 超级管理员，可跨租户 |
| `tenant_admin` | 租户管理员 |
| `user` | 租户级普通管理用户 |
| `building_user` | 建筑范围用户 |
| `group_user` | 分组范围用户 |

非 `admin` 用户的租户范围以 Token 对应用户为准。不要相信客户端自行提交的 `tenant_id`。

### 4.2 页面权限

普通用户在 Web 前端还会受到 `profile.permissions` 菜单权限限制。当前常用权限值：

```text
devices
lighting
switch-control
thermostat
air-conditioner
alarms
protocols
```

当前后端只有部分接口（例如照明数据）显式执行 `requirePermission`，其余不少接口主要依赖登录角色和租户范围。第三方接入不能把“前端未显示按钮”当作后端安全边界；正式开放前应继续统一接口级权限中间件。

### 4.3 登录示例

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "operator",
  "password": "******"
}
```

返回的 `token`、`refreshToken` 和 `user` 应保存在小程序本地安全存储中。不要把密码、Token 或 MQTT 密钥写入日志。

### 4.4 刷新 Token

```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "<refreshToken>"
}
```

建议在请求层统一处理 `401`，同一时刻只发起一次刷新请求，刷新成功后重放等待中的请求。

## 5. API 总表

权限缩写：

- `公开`：不需要 Token。
- `登录`：任意已登录且通过数据范围校验的用户。
- `Admin`：仅 `admin`。
- `租管`：`admin` 或 `tenant_admin`。
- `照明权限`：`admin`、`tenant_admin` 或拥有 `lighting`/`switch-control` 权限。
- `分级管理`：按用户角色层级、租户、建筑和分组范围判断。
- `登录+范围`：已登录，并按租户、建筑、分组范围过滤数据。
- `登录+本人`：只能访问当前登录用户自己的消息或资料。

### 5.1 根级运维接口

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/health` | 公开 | 轻量健康检查，返回进程运行时间和环境 |
| GET | `/metrics` | 公开 | 服务性能指标；建议生产环境通过网关限制来源 |

### 5.2 认证 `/api/auth`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| POST | `/api/auth/login` | 公开 | 登录；Body: `username,password` |
| POST | `/api/auth/register` | 公开 | 注册；Body: `username,email,password,real_name,phone,tenant_id` |
| POST | `/api/auth/refresh` | 公开 | 刷新访问令牌；Body: `refreshToken` |
| POST | `/api/auth/logout` | 登录 | 登出当前会话 |
| GET | `/api/auth/me` | 登录 | 获取当前用户、角色、租户和权限；小程序推荐使用 |
| PUT | `/api/auth/password` | 登录 | 修改本人密码；Body: `oldPassword,newPassword` |
| GET | `/api/auth/check` | 可选登录 | 检查 Token 是否有效 |

### 5.3 设备管理 `/api/devices`

列表筛选参数：

```text
page, pageSize, keyword, status, type, tenantId, buildingId,
projectGroupId, isThermostat, isLighting, isSwitch,
isAirConditioner, excludeGateways
```

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/devices` | 登录 | 获取设备和网关子设备列表 |
| POST | `/api/devices` | 登录 | 创建设备；支持独立设备、网关和子设备 |
| GET | `/api/devices/gateways` | 登录 | 获取可作为上级的网关 |
| GET | `/api/devices/:id` | 登录 | 获取设备详情 |
| PUT | `/api/devices/:id` | 登录 | 更新设备基础信息、项目归属和协议 |
| DELETE | `/api/devices/:id` | 登录 | 删除设备 |
| GET | `/api/devices/check-imei/:imei` | 登录 | 检查 IMEI/设备 ID 是否重复 |
| GET | `/api/devices/:id/data` | 登录 | 获取设备历史数据；Query: `startTime,endTime,limit,dataType` |
| GET | `/api/devices/:id/logs` | 登录 | 获取设备日志；Query: `page,pageSize,eventType,startTime,endTime` |
| POST | `/api/devices/:id/command` | 登录 | 通用设备命令；Body: `command,params,timestamp,mqttTopic` |
| GET | `/api/devices/stats/overview` | 登录 | 设备在线、离线及分类统计 |

设备创建常用字段：

```json
{
  "name": "房间温控器",
  "imei": "DEVICE-ABC-001",
  "device_type_id": "<uuid>",
  "manufacturer_code": "BNLTE",
  "protocol_config_id": "<uuid>",
  "tenant_id": "<uuid>",
  "project_building_id": "<uuid>",
  "project_group_id": "<uuid>",
  "device_category": "standalone",
  "parent_device_id": null,
  "connection_config": {}
}
```

`device_category` 常见值：`standalone`、`gateway`、`sub_device`。

### 5.4 设备 MQTT 配置 `/api/device-config`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/device-config/:deviceId/mqtt-config` | 登录+设备权限 | 获取设备 MQTT 配置 |
| PUT | `/api/device-config/:deviceId/mqtt-config` | 登录+设备权限 | 更新配置；Body: `{mqtt_config:{...}}` |
| GET | `/api/device-config/:deviceId/subscribe-topics` | 登录+设备权限 | 获取订阅主题 |
| GET | `/api/device-config/:deviceId/publish-topics` | 登录+设备权限 | 获取发布主题 |
| PATCH | `/api/device-config/:deviceId/mqtt-status` | 登录+设备权限 | 启停设备 MQTT；Body: `{enabled:true}` |
| GET | `/api/device-config/mqtt-config-template` | 登录 | 获取 MQTT 配置模板 |

此模块属于运维配置，不建议直接开放给微信小程序普通用户。

### 5.5 设备类型 `/api/device-types`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/device-types` | 登录 | 设备类型列表 |
| GET | `/api/device-types/:id` | 登录 | 设备类型详情 |
| POST | `/api/device-types` | Admin | 创建设备类型；Body: `name,description,tenant_id` |
| PUT | `/api/device-types/:id` | Admin | 更新设备类型 |
| DELETE | `/api/device-types/:id` | Admin | 删除设备类型 |

### 5.6 租户 `/api/tenants`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/tenants` | 租管 | 租户列表；Query: `page,pageSize,keyword,status` |
| GET | `/api/tenants/:id` | 租户范围 | 租户详情 |
| POST | `/api/tenants` | Admin | 创建租户 |
| PUT | `/api/tenants/:id` | Admin | 更新租户 |
| DELETE | `/api/tenants/:id` | Admin | 删除租户 |
| GET | `/api/tenants/:id/users` | 租户范围 | 租户用户列表 |
| GET | `/api/tenants/:id/devices` | 租户范围 | 租户设备列表；可按 `type,status,keyword` 筛选 |
| GET | `/api/tenants/stats/overview` | Admin | 全平台租户统计 |

创建租户 Body：

```text
name, code, type, contact_person, contact_phone, contact_email,
address, device_limit, expire_date, settings
```

### 5.7 项目建筑与分组 `/api/project-management`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/project-management/buildings` | 登录 | 建筑列表；Query: `tenantId,keyword,status` |
| POST | `/api/project-management/buildings` | 租管 | 创建建筑；Body: `tenant_id,name,code,address,description,status` |
| PUT | `/api/project-management/buildings/:id` | 租管 | 更新建筑 |
| DELETE | `/api/project-management/buildings/:id` | 租管 | 删除建筑 |
| GET | `/api/project-management/groups` | 登录 | 项目分组列表；Query: `tenantId,buildingId,keyword,status` |
| POST | `/api/project-management/groups` | 租管 | 创建分组；Body: `tenant_id,building_id,name,code,description,status` |
| PUT | `/api/project-management/groups/:id` | 租管 | 更新分组 |
| DELETE | `/api/project-management/groups/:id` | 租管 | 删除分组 |

项目分组以此模块为唯一管理入口。温控模块中的旧分组接口只用于兼容历史数据。

### 5.8 厂商 `/api/manufacturers`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/manufacturers` | 登录 | 厂商列表；Query: `page,pageSize,keyword,status,type` |
| GET | `/api/manufacturers/:id` | Admin | 厂商详情 |
| GET | `/api/manufacturers/code/:code` | 登录 | 按厂商编码查询 |
| POST | `/api/manufacturers` | Admin | 创建厂商并热加载 MQTT 订阅 |
| PUT | `/api/manufacturers/:id` | Admin | 更新厂商并刷新订阅 |
| DELETE | `/api/manufacturers/:id` | Admin | 删除厂商并刷新订阅 |
| PATCH | `/api/manufacturers/:id/status` | Admin | 启停厂商；Body: `{status:"active"}` |

创建/更新 Body：

```json
{
  "code": "BNLTE",
  "name": "厂商名称",
  "contact": "联系人",
  "phone": "联系电话",
  "email": "mail@example.com",
  "address": "",
  "website": "",
  "description": "",
  "status": "active",
  "tenant_id": "<uuid>",
  "mqttConfig": {
    "subscriptionType": "custom",
    "subscribeTopics": [],
    "publishTopics": []
  }
}
```

### 5.9 协议配置 `/api/protocol-configs`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/protocol-configs` | 登录 | 协议列表；Query: `page,pageSize,keyword,manufacturerCode,deviceType,status` |
| GET | `/api/protocol-configs/template/example` | 登录 | 获取可视化协议示例 |
| GET | `/api/protocol-configs/:id` | 登录 | 协议详情 |
| POST | `/api/protocol-configs` | Admin | 创建全局协议并热更新 |
| PUT | `/api/protocol-configs/:id` | Admin | 更新协议并热更新 |
| DELETE | `/api/protocol-configs/:id` | Admin | 删除未被设备使用的协议 |

协议 Body：

```text
name, version, protocol_type, manufacturer_code, device_type,
description, data_parsing_config, command_config, validation_rules,
modbus_config, modbus_registers, is_default, status
```

小程序只需读取协议能力，不应提供协议编辑功能。

### 5.10 照明控制 `/api/lighting-control`

列表 Query：

```text
page, pageSize, tenantId, keyword, device_type, lighting_type,
status, buildingId, projectGroupId
```

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/lighting-control` | 登录 | 照明控制设备分页列表 |
| GET | `/api/lighting-control/available-devices` | 登录 | 可加入照明模块的设备 |
| POST | `/api/lighting-control` | 登录 | 加入照明控制；Body: `device_id,device_type,lighting_type,group_name,display_order` |
| PUT | `/api/lighting-control/:id` | 登录 | 更新显示配置 |
| DELETE | `/api/lighting-control/:id` | 登录 | 从照明控制软删除 |
| PUT | `/api/lighting-control/batch/order` | 登录 | 批量排序；Body: `{devices:[{id,display_order}]}` |
| POST | `/api/lighting-control/:deviceId/control` | 登录 | 控制一路或多路照明 |

推荐控制 Body：

```json
{
  "type": "event",
  "key1": 1,
  "key2": 0,
  "key3": 1
}
```

兼容格式：

```json
{
  "command": {
    "switch_1": 1,
    "switch_2": 0,
    "switch_3": 1
  }
}
```

### 5.11 开关控制 `/api/switch-control`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/switch-control` | 登录 | 定时开关分页列表；Query: `page,pageSize,tenantId,keyword,status,buildingId,projectGroupId` |
| GET | `/api/switch-control/available-devices` | 登录 | 可加入开关控制的设备 |
| GET | `/api/switch-control/:imei/status` | 登录 | 最新开关状态 |
| POST | `/api/switch-control` | 登录 | 加入模块；Body: `device_id,phase_type,lighting_type,group_name,display_order` |
| PUT | `/api/switch-control/:id` | 登录 | 更新相制和显示顺序 |
| DELETE | `/api/switch-control/:id` | 登录 | 从开关模块移除 |
| POST | `/api/switch-control/:deviceId/control` | 登录 | 下发开关控制，格式同照明控制 |

读取统计数据可发送：

```json
{
  "type": "statistic"
}
```

### 5.12 分散空调控制 `/api/air-conditioner-control`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/air-conditioner-control` | 登录 | 分散空调设备列表；Query: `page,pageSize,tenantId,keyword,status,buildingId,projectGroupId` |
| POST | `/api/air-conditioner-control/sync-devices` | 登录 | 将符合类型的设备同步到空调控制模块 |
| PUT | `/api/air-conditioner-control/strategy` | 登录 | 保存多设备策略；Body: `deviceIds,strategy` |
| GET | `/api/air-conditioner-control/:deviceId/detail` | 登录 | 设备状态、电气数据、历史趋势和控制记录；Query: `hours,limit` |
| POST | `/api/air-conditioner-control/:deviceId/control` | 登录 | 下发空调命令 |
| DELETE | `/api/air-conditioner-control/:deviceId` | 登录 | 从空调控制模块移除 |

控制 Body 由设备协议决定，统一字段建议：

```json
{
  "command": {
    "action": "set_temperature",
    "power_state": 1,
    "mode": "cool",
    "fan_speed": 2,
    "target_temperature": 24
  }
}
```

DA51KD 等 Hex 协议由后端编码，小程序不要自行拼装 Hex。

### 5.13 照明/开关电气数据 `/api/lighting-data`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| POST | `/api/lighting-data/insert` | 照明权限 | 人工写入单条照明数据；Body 至少 `manufacturer_code,device_imei` |
| POST | `/api/lighting-data/batch-insert` | 照明权限 | 批量写入；Body: `{data_list:[...]}` |
| GET | `/api/lighting-data/switch-electrical/latest/:imei` | 照明权限 | 开关最新电气数据；Query: `manufacturer_code` |
| GET | `/api/lighting-data/switch-electrical/history/:imei` | 照明权限 | 开关电气历史；Query: `manufacturer_code,start_time,end_time,limit` |
| GET | `/api/lighting-data/latest/:imei` | 照明权限 | 照明模块最新数据 |
| GET | `/api/lighting-data/history/:imei` | 照明权限 | 照明历史；Query: `start_time,end_time,limit` |
| GET | `/api/lighting-data/stats/:manufacturer_code` | 照明权限 | 指定厂商数据统计 |

外部客户端通常只读，不应调用 `insert` 和 `batch-insert`。

### 5.14 照明情景 `/api/lighting-scenes`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/lighting-scenes` | 登录 | 情景列表；Query: `scene_type` |
| GET | `/api/lighting-scenes/:id` | 登录 | 情景详情 |
| POST | `/api/lighting-scenes` | 登录 | 创建情景 |
| PUT | `/api/lighting-scenes/:id` | 登录 | 更新情景 |
| DELETE | `/api/lighting-scenes/:id` | 登录 | 硬删除情景 |
| POST | `/api/lighting-scenes/:id/execute` | 登录 | 执行情景 |

情景 Body：

```text
scene_name, scene_description, scene_type, enable_timer,
start_time, end_time, repeat_days, devices_config
```

### 5.15 照明定时 `/api/lighting-timer`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| POST | `/api/lighting-timer` | 登录 | 创建设备定时；Body: `deviceId,action,time,repeat,enabled,name` |
| GET | `/api/lighting-timer/:deviceId` | 登录 | 获取设备定时列表 |
| PUT | `/api/lighting-timer/:id/toggle` | 登录 | 启停定时；Body: `{enabled:true}` |
| DELETE | `/api/lighting-timer/:id` | 登录 | 删除定时 |

### 5.16 温控控制 `/api/thermostat`

全部接口要求登录并受租户、建筑/分组和设备访问范围限制。

#### 设备与控制

| 方法 | 路径 | 用途/关键参数 |
|---|---|---|
| GET | `/api/thermostat/devices` | 温控设备列表；Query: `page,pageSize,keyword,status,buildingId,projectGroupId,tenantId` |
| GET | `/api/thermostat/devices/:deviceId` | 温控设备详情 |
| POST | `/api/thermostat/devices` | 加入温控模块；只允许空调温控器，禁止网关 |
| DELETE | `/api/thermostat/devices/:deviceId` | 从温控模块移除 |
| POST | `/api/thermostat/devices/:deviceId/power-on` | 开机；可带 `target_temp,fan_speed,ac_mode` |
| POST | `/api/thermostat/devices/:deviceId/power-off` | 关机 |
| POST | `/api/thermostat/devices/:deviceId/temperature` | 设置温度；Body: `temperature` 或 `target_temp`，范围 16-30 |
| POST | `/api/thermostat/devices/:deviceId/fan-speed` | 设置风速；Body: `fan_speed`，0-3 |
| POST | `/api/thermostat/devices/:deviceId/mode` | 设置模式；Body: `ac_mode`，取值 `cool,heat,dehumidify,fan` |
| POST | `/api/thermostat/devices/:deviceId/temp-lock` | 童锁；Body: `{locked:true}` |
| GET | `/api/thermostat/devices/:deviceId/status` | 读取当前状态 |
| POST | `/api/thermostat/devices/:deviceId/force-refresh` | 主动请求设备刷新状态 |
| GET | `/api/thermostat/devices/:deviceId/protocol-config` | 获取设备协议能力 |

#### 计划

| 方法 | 路径 | 用途/关键参数 |
|---|---|---|
| GET | `/api/thermostat/schedules` | 租户计划列表 |
| GET | `/api/thermostat/devices/:deviceId/schedules` | 指定设备计划 |
| GET | `/api/thermostat/schedules/:scheduleId` | 计划详情 |
| POST | `/api/thermostat/schedules` | 创建计划 |
| PUT | `/api/thermostat/schedules/:scheduleId` | 更新计划 |
| DELETE | `/api/thermostat/schedules/:scheduleId` | 删除计划 |
| POST | `/api/thermostat/schedules/:scheduleId/toggle` | 启停计划；Body: `{enabled:true}` |

#### 统计、情景和日志

| 方法 | 路径 | 用途/关键参数 |
|---|---|---|
| GET | `/api/thermostat/devices/:deviceId/stats` | 单日运行统计；Query: `date` |
| GET | `/api/thermostat/devices/:deviceId/stats/range` | 日期范围统计；Query: `startDate,endDate` |
| GET | `/api/thermostat/stats/summary` | 租户统计汇总；Query: `date` |
| GET | `/api/thermostat/stats/running` | 运行状态统计；Query: `dateRange,startDate,endDate,deviceId,groupId,mode` |
| GET | `/api/thermostat/stats/runtime` | 运行时长趋势；Query: `startDate,endDate,deviceId,groupId` |
| GET | `/api/thermostat/scenes` | 温控情景列表 |
| POST | `/api/thermostat/scenes` | 创建温控情景 |
| PUT | `/api/thermostat/scenes/:sceneId` | 更新温控情景 |
| DELETE | `/api/thermostat/scenes/:sceneId` | 删除温控情景 |
| POST | `/api/thermostat/scenes/:sceneId/execute` | 执行情景；Body: `{deviceIds:[...]}` |
| GET | `/api/thermostat/devices/:deviceId/logs` | 设备控制日志；Query: `page,pageSize` |
| GET | `/api/thermostat/logs` | 租户控制日志；Query: `page,pageSize` |

#### 批量控制

| 方法 | 路径 | 用途/关键参数 |
|---|---|---|
| POST | `/api/thermostat/batch/power-on` | 批量开机；Body: `deviceIds,settings` |
| POST | `/api/thermostat/batch/power-off` | 批量关机；Body: `deviceIds` |
| POST | `/api/thermostat/batch/temperature` | 批量调温；Body: `deviceIds,target_temp` |
| POST | `/api/thermostat/batch/mode` | 批量设模式；Body: `deviceIds,ac_mode` |

### 5.17 告警与派单 `/api/alarms`

告警列表 Query：

```text
page, pageSize, tenantId, keyword, moduleType, severity, status,
alarmType, buildingId, groupId, startAt, endAt, mine
```

枚举：

```text
moduleType: switch | lighting | thermostat | air_conditioner
severity: critical | high | medium | low
status: active | acknowledged | assigned | processing | resolved | closed | open
```

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/alarms/summary` | 登录+范围 | 告警概览、分类、等级和趋势 |
| GET | `/api/alarms/options` | 登录+范围 | 可派单处理人 |
| GET | `/api/alarms` | 登录+范围 | 告警分页列表 |
| GET | `/api/alarms/:id` | 登录+范围 | 告警详情和完整处理时间轴 |
| POST | `/api/alarms/:id/actions` | 登录+流程权限 | 单条告警流转 |
| POST | `/api/alarms/:id/actions-with-photos` | 登录+流程权限 | 单条告警流转并上传现场照片 |
| GET | `/api/alarms/:id/photos/:photoId/content` | 登录+范围 | 读取现场照片二进制内容 |
| DELETE | `/api/alarms/:id/photos/:photoId` | 上传人/管理员 | 删除现场照片 |
| POST | `/api/alarms/batch-actions` | 登录+流程权限 | 批量流转，最多 100 条 |
| GET | `/api/alarms/notifications/unread-count` | 登录+本人 | 当前用户未读派单数 |
| GET | `/api/alarms/notifications` | 登录+本人 | 站内告警消息；Query: `limit,unreadOnly` |
| POST | `/api/alarms/notifications/:id/read` | 登录+本人 | 单条消息已读 |
| POST | `/api/alarms/notifications/read-all` | 登录+本人 | 全部消息已读 |

单条流程 Body：

```json
{
  "action": "assign",
  "assignedTo": "<userUuid>",
  "note": "请检查现场线路"
}
```

带现场照片的流程使用 `multipart/form-data`：

```text
action: process
note: 已检查线路并重新紧固接线端子
clientType: pc | mini_program
photos: <image file>  可重复提交，最多 10 张
capturedAt: 2026-07-26T10:30:00+08:00  可选
latitude: 36.6512000  可选
longitude: 117.1201000  可选
locationText: 1号楼3层配电间  可选
```

照片支持 JPG、PNG、WEBP、HEIC、HEIF，单张不超过 8MB。Web/PC 端照片选填；微信小程序应发送请求头
`X-Client-Type: mini_program`，且执行 `process` 或 `resolve` 时必须在当前请求上传至少一张现场照片。
照片读取接口需要登录凭证，详情接口返回的 `photos` 数组及每条 `action.photos` 可用于处理时间轴展示。

批量流程 Body：

```json
{
  "alarmIds": ["<alarmUuid1>", "<alarmUuid2>"],
  "action": "acknowledge",
  "note": ""
}
```

动作与状态：

| action | 作用 | 关键要求 |
|---|---|---|
| `acknowledge` | 确认告警 | 当前状态为 `active` |
| `assign` | 派单，进入 `assigned` | 分级管理角色，必须 `assignedTo` |
| `accept` | 处理人接单，进入 `processing` | 仅当前处理人 |
| `reject` | 退回，回到 `acknowledged` | 仅当前处理人，必须填写 `note` |
| `process` | 记录处理进展 | 当前处理人或管理员 |
| `comment` | 增加备注 | 必须填写 `note` |
| `resolve` | 解决告警 | `processing` 状态，必须填写 `note` |
| `close` | 关闭告警 | `resolved` 状态 |
| `reopen` | 重新打开 | `resolved/closed`，必须填写 `note` |

### 5.18 用户管理 `/api/users`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/users` | 分级管理 | 用户列表；Query: `page,pageSize,search,role,status,tenantId,buildingId,groupId` |
| GET | `/api/users/:id` | 分级管理 | 用户详情 |
| POST | `/api/users` | 分级管理 | 创建下级用户 |
| PUT | `/api/users/:id` | 分级管理 | 更新用户 |
| PUT | `/api/users/:id/status` | 分级管理 | 启停用户；Body: `{status:"active"}` |
| PUT | `/api/users/:id/password` | 分级管理 | 管理员重置密码；Body: `{newPassword:"..."}` |
| GET | `/api/users/:id/permissions` | 分级管理 | 获取页面权限 |
| PUT | `/api/users/:id/permissions` | 分级管理 | 更新权限；Body: `{permissions:[...]}` |
| DELETE | `/api/users/:id` | 分级管理 | 删除用户 |

创建用户 Body：

```text
username, email, password, role, tenant_id, profile
```

`profile` 可包含：

```text
real_name, phone, project_building_id, project_group_id, permissions
```

### 5.19 系统 `/api/system`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| GET | `/api/system/stats` | 登录 | 全局/租户系统统计 |
| GET | `/api/system/dashboard-stats` | 登录 | 首页监控统计，小程序首页推荐 |
| GET | `/api/system/message-flow` | 登录 | MQTT 消息流趋势；Query: `timeRange` |
| GET | `/api/system/health` | 公开 | 数据库、内存、磁盘综合健康检查 |
| GET | `/api/system/logs` | Admin | 系统日志；Query: `page,pageSize,level,startTime,endTime` |
| GET | `/api/system/performance` | 登录 | 性能趋势；Query: `period` |
| POST | `/api/system/cleanup` | Admin | 清理历史数据；高风险接口 |
| GET | `/api/system/config` | Admin | 系统配置 |
| PUT | `/api/system/config` | Admin | 更新系统配置 |
| GET | `/api/system/notification-config` | Admin | 邮件、短信、微信通知配置 |
| PUT | `/api/system/notification-config` | Admin | 更新通知配置 |
| GET | `/api/system/security-config` | Admin | 密码和登录安全配置 |
| PUT | `/api/system/security-config` | Admin | 更新安全配置 |
| POST | `/api/system/check-update` | Admin | 检查系统更新 |
| GET | `/api/system/info` | 公开 | 系统名称、版本和环境信息 |

`cleanup`、配置更新、日志和性能接口不应开放给普通小程序用户。

### 5.20 旧设备统计回调 `/api/v1/eqinfo`

| 方法 | 路径 | 权限 | 用途/关键参数 |
|---|---|---|---|
| POST | `/api/v1/eqinfo` | 公开 | 按用户名返回照明设备在线/离线统计；Body: `{user:"username"}` |

这是旧兼容接口，会暴露用户名对应租户的设备统计。新小程序不要调用，后续应增加签名认证或停用。

## 6. WebSocket 实时通信

### 6.1 连接

```text
wss://bnyk.boningse.com/ws
Authorization: Bearer <accessToken>
```

服务也兼容 `/ws?token=<accessToken>`，但正式客户端优先通过请求头传递，避免 Token 出现在 URL。

### 6.2 客户端消息

心跳：

```json
{"type":"ping"}
```

订阅：

```json
{
  "type": "subscribe",
  "topics": ["device_status", "lighting_switch_status"]
}
```

取消订阅：

```json
{
  "type": "unsubscribe",
  "topics": ["lighting_switch_status"]
}
```

服务响应 `pong`、`subscribed`、`unsubscribed` 或 `error`。普通用户不能订阅 `*`。

设备控制优先走 HTTP API。不要从小程序直接连接 MQTT Broker。

## 7. 微信小程序推荐调用流程

### 7.1 第一阶段页面与接口

| 小程序页面 | 推荐接口 |
|---|---|
| 登录 | `POST /api/auth/login`、`POST /api/auth/refresh` |
| 我的 | `GET /api/auth/me`、`PUT /api/auth/password` |
| 首页 | `GET /api/system/dashboard-stats` |
| 项目选择 | `GET /api/project-management/buildings`、`GET /api/project-management/groups` |
| 设备列表 | `GET /api/devices` |
| 照明 | `/api/lighting-control`、`/api/lighting-data` |
| 开关 | `/api/switch-control`、`/api/lighting-data/switch-electrical/*` |
| 温控 | `/api/thermostat/devices` 及控制、统计接口 |
| 分散空调 | `/api/air-conditioner-control` |
| 告警 | `/api/alarms`、`/api/alarms/notifications` |

### 7.2 小程序请求封装示例

```js
const API_BASE = "https://bnyk.boningse.com/api";

function request(path, options = {}) {
  const token = wx.getStorageSync("accessToken");

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE}${path}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(response) {
        if (response.statusCode === 401) {
          reject(new Error("AUTH_EXPIRED"));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(response.data?.message || "请求失败"));
          return;
        }
        resolve(response.data);
      },
      fail: reject
    });
  });
}
```

### 7.3 控制接口原则

1. 点击控制后立即禁用按钮，防止连续下发。
2. HTTP 返回成功只代表命令已发送，不等于设备已经执行。
3. 通过状态查询或 WebSocket 上报确认最终状态。
4. 设备离线时提示用户，不自动无限重试控制命令。
5. 每条控制请求生成客户端请求 ID，便于日志追踪。

## 8. 安全注意事项

### 8.1 不建议对外开放

- `/metrics`
- `/api/system/cleanup`
- `/api/system/config`
- `/api/system/security-config`
- `/api/device-config/*`
- 协议和厂商写接口
- 数据人工写入接口
- `/api/v1/eqinfo`

建议由 Nginx/API 网关根据来源、角色、频率和方法二次限制。

## 9. 后续接口治理建议

为微信小程序正式发布，建议按顺序完成：

1. 新增稳定的 `/api/v2` 版本前缀，保留当前接口作为兼容层。
2. 禁止公开注册，改为管理员创建或微信身份绑定。
3. 为小程序增加微信登录换取系统 Token 的专用接口。
4. 统一列表返回结构、分页参数和时间字段。
5. 为控制请求增加 `requestId`、幂等键和执行回执状态。
6. 为公开回调增加 HMAC 签名、时间戳和重放保护。
7. 自动生成并维护 OpenAPI 3.1 文档。

## 10. 文档维护规则

- 新增或修改路由时必须同步更新本文。
- 路由以 `backend/app.js` 的实际挂载为准。
- 控制参数以设备绑定的协议配置为准。
- 文档中的示例不包含真实密码、Token、MQTT 密钥或设备隐私数据。
- 每次正式版本发布前，对接口数量、权限、重复路径和路由挂载状态重新扫描。
