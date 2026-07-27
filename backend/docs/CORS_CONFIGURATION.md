# CORS配置说明

## 概述

本文档说明了IoT系统中CORS（跨源资源共享）的配置和安全考虑。

## 当前配置

### 开发环境
- **允许所有源**：包括没有Origin头部的请求
- **用途**：便于开发调试，支持Postman、curl等工具测试
- **安全级别**：低（仅限开发环境）

### 生产环境
- **严格源检查**：只允许预定义的可信域名
- **可配置的无Origin请求**：通过环境变量`ALLOW_NO_ORIGIN=true`控制
- **安全级别**：高

## 环境变量配置

### ALLOW_NO_ORIGIN
- **默认值**：`false`
- **作用**：在生产环境下是否允许没有Origin头部的请求
- **设置方式**：在`.env`文件中添加`ALLOW_NO_ORIGIN=true`

### ALLOWED_ORIGINS
- **作用**：添加额外的允许域名
- **格式**：逗号分隔的域名列表
- **示例**：`ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com`

## 安全考虑

### 允许无Origin请求的风险

1. **CSRF攻击风险**
   - 没有Origin头部的请求可能来自恶意脚本
   - 建议仅在必要时启用

2. **合法使用场景**
   - 服务器到服务器的API调用
   - 移动应用的原生HTTP请求
   - 某些代理服务器的请求
   - 开发工具（Postman、curl等）

### 安全建议

1. **生产环境**
   - 默认禁用无Origin请求
   - 仅在确认安全的情况下启用
   - 定期审查允许的域名列表

2. **监控和日志**
   - 监控CORS相关的警告日志
   - 记录被拒绝的请求来源
   - 定期分析访问模式

3. **其他安全措施**
   - 使用HTTPS
   - 实施API认证和授权
   - 设置适当的CSP（内容安全策略）
   - 使用防火墙和入侵检测系统

## 故障排除

### 常见问题

1. **开发环境仍有CORS警告**
   - 检查`NODE_ENV`是否设置为`development`
   - 重启后端服务器

2. **生产环境合法请求被拒绝**
   - 检查域名是否在允许列表中
   - 考虑设置`ALLOW_NO_ORIGIN=true`（谨慎使用）

3. **移动应用无法访问API**
   - 移动应用通常没有Origin头部
   - 在生产环境设置`ALLOW_NO_ORIGIN=true`
   - 或者为移动应用配置特定的User-Agent检查

## 配置示例

### 开发环境 (.env)
```
NODE_ENV=development
# 开发环境下自动允许所有请求
```

### 生产环境 (.env.prod)
```
NODE_ENV=production
# 允许没有Origin的请求（谨慎使用）
ALLOW_NO_ORIGIN=true
# 额外允许的域名
ALLOWED_ORIGINS=https://app.example.com,https://admin.example.com
```

## 更新日志

- **2025-08-05**: 修改CORS配置，支持开发环境无警告，生产环境可配置无Origin请求
- **初始版本**: 基础CORS配置实现