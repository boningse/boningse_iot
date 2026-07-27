# GitHub部署指南

本指南将帮助您将IoT设备管理系统项目部署到GitHub，并提供完整的项目管理和协作流程。

## 📋 准备工作

### 1. 创建GitHub仓库

1. 登录 [GitHub](https://github.com)
2. 点击右上角的 "+" 按钮，选择 "New repository"
3. 填写仓库信息：
   - **Repository name**: `iot-device-management`
   - **Description**: `一个基于Vue.js + Node.js + PostgreSQL + MQTT的现代化IoT设备管理平台`
   - **Visibility**: Public 或 Private（根据需要选择）
   - **Initialize**: 不要勾选任何初始化选项（因为我们已有代码）

### 2. 本地Git配置

```bash
# 初始化Git仓库（如果还没有）
git init

# 配置用户信息
git config user.name "Your Name"
git config user.email "your.email@example.com"

# 添加远程仓库
git remote add origin https://github.com/your-username/iot-device-management.git
```

## 🚀 部署步骤

### 1. 准备代码

```bash
# 检查当前状态
git status

# 添加所有文件到暂存区
git add .

# 提交代码
git commit -m "Initial commit: IoT Device Management System

- 完整的前后端分离架构
- Docker容器化部署支持
- MQTT实时通信
- PostgreSQL数据库
- 多租户架构
- 用户认证和权限管理
- 实时数据监控和可视化"
```

### 2. 推送到GitHub

```bash
# 推送到主分支
git branch -M main
git push -u origin main
```

### 3. 验证部署

访问您的GitHub仓库页面，确认所有文件都已正确上传。

## 📝 项目文档完善

### 1. 更新README.md

确保README.md中的GitHub链接正确：

```markdown
# 克隆项目
git clone https://github.com/your-username/iot-device-management.git
```

### 2. 创建项目标签

```bash
# 创建版本标签
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0
```

### 3. 设置仓库描述和主题

在GitHub仓库页面：
1. 点击右上角的 "Settings"
2. 在 "General" 部分添加：
   - **Description**: `现代化IoT设备管理平台 - Vue.js + Node.js + PostgreSQL + MQTT`
   - **Website**: 您的演示网站URL（如果有）
   - **Topics**: `iot`, `vue`, `nodejs`, `postgresql`, `mqtt`, `docker`, `device-management`

## 🔧 GitHub功能配置

### 1. 启用Issues

在仓库Settings中启用Issues功能，用于：
- Bug报告
- 功能请求
- 用户反馈
- 技术讨论

### 2. 设置分支保护

```bash
# 创建开发分支
git checkout -b develop
git push -u origin develop
```

在GitHub Settings > Branches中：
- 设置 `main` 分支为默认分支
- 启用分支保护规则
- 要求Pull Request审查

### 3. 配置GitHub Actions（可选）

创建 `.github/workflows/ci.yml`：

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: |
        npm install
        cd backend && npm install
    
    - name: Run tests
      run: |
        npm test
        cd backend && npm test
    
    - name: Build project
      run: npm run build

  docker:
    runs-on: ubuntu-latest
    needs: test
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Build Docker images
      run: |
        docker-compose build
    
    - name: Test Docker deployment
      run: |
        docker-compose up -d
        sleep 30
        ./docker-test.sh
        docker-compose down
```

## 📊 项目管理

### 1. 创建项目看板

在GitHub仓库中：
1. 点击 "Projects" 标签
2. 创建新项目看板
3. 设置列：
   - **Backlog**: 待处理任务
   - **In Progress**: 进行中
   - **Review**: 代码审查
   - **Done**: 已完成

### 2. 设置里程碑

创建版本里程碑：
- v1.1.0 - 性能优化
- v1.2.0 - 新功能开发
- v2.0.0 - 架构升级

### 3. 标签管理

创建Issue标签：
- `bug` - 错误报告
- `enhancement` - 功能增强
- `documentation` - 文档相关
- `help wanted` - 需要帮助
- `good first issue` - 适合新手

## 🤝 协作流程

### 1. 贡献指南

创建 `CONTRIBUTING.md`：

```markdown
# 贡献指南

感谢您对IoT设备管理系统的贡献！

## 开发流程

1. Fork项目
2. 创建功能分支
3. 提交代码
4. 创建Pull Request

## 代码规范

- 遵循ESLint配置
- 添加适当的注释
- 编写单元测试
- 更新相关文档

## 提交信息格式

```
type(scope): description

[optional body]

[optional footer]
```

类型：
- feat: 新功能
- fix: 错误修复
- docs: 文档更新
- style: 代码格式
- refactor: 重构
- test: 测试相关
- chore: 构建过程或辅助工具的变动
```

### 2. Pull Request模板

创建 `.github/pull_request_template.md`：

```markdown
## 变更描述

请简要描述此PR的变更内容。

## 变更类型

- [ ] Bug修复
- [ ] 新功能
- [ ] 重构
- [ ] 文档更新
- [ ] 性能优化
- [ ] 其他

## 测试

- [ ] 已添加单元测试
- [ ] 已进行手动测试
- [ ] 所有测试通过

## 检查清单

- [ ] 代码遵循项目规范
- [ ] 已更新相关文档
- [ ] 已测试在不同环境下的兼容性
- [ ] 已检查是否有破坏性变更

## 相关Issue

关闭 #(issue编号)
```

### 3. Issue模板

创建 `.github/ISSUE_TEMPLATE/bug_report.md`：

```markdown
---
name: Bug报告
about: 创建一个bug报告来帮助我们改进
title: '[BUG] '
labels: 'bug'
assignees: ''
---

## Bug描述

简要描述遇到的问题。

## 复现步骤

1. 进入 '...'
2. 点击 '....'
3. 滚动到 '....'
4. 看到错误

## 期望行为

描述您期望发生的行为。

## 实际行为

描述实际发生的行为。

## 环境信息

- OS: [例如 Ubuntu 20.04]
- Browser: [例如 Chrome 91]
- Node.js版本: [例如 18.17.0]
- Docker版本: [例如 20.10.21]

## 附加信息

添加任何其他有关问题的上下文信息。
```

## 🔒 安全配置

### 1. 敏感信息保护

确保以下文件在 `.gitignore` 中：

```gitignore
# 环境变量
.env
.env.local
.env.production

# 密钥文件
*.key
*.pem
*.p12

# 数据库文件
*.db
*.sqlite

# 日志文件
logs/
*.log
```

### 2. GitHub Secrets配置

在仓库Settings > Secrets中添加：
- `DB_PASSWORD`: 数据库密码
- `JWT_SECRET`: JWT密钥
- `DOCKER_USERNAME`: Docker Hub用户名
- `DOCKER_PASSWORD`: Docker Hub密码

### 3. 安全扫描

启用GitHub的安全功能：
- Dependabot alerts
- Code scanning
- Secret scanning

## 📈 项目推广

### 1. 完善项目描述

在README.md中添加：
- 项目徽章（构建状态、版本、许可证等）
- 功能截图或演示GIF
- 详细的功能特性说明
- 完整的安装和使用指南

### 2. 社区建设

- 创建Discussions区域
- 定期发布Release notes
- 回应Issues和PR
- 维护项目Wiki

### 3. 文档网站

考虑使用GitHub Pages创建项目文档网站：

```bash
# 创建docs分支
git checkout --orphan gh-pages
git rm -rf .
echo "Coming Soon" > index.html
git add index.html
git commit -m "Initial GitHub Pages"
git push origin gh-pages
```

## 🎯 下一步计划

1. **完善文档**: 添加API文档、部署指南、故障排除等
2. **自动化测试**: 设置CI/CD流水线
3. **性能监控**: 集成性能监控和错误追踪
4. **社区建设**: 建立贡献者社区
5. **功能扩展**: 根据用户反馈添加新功能

## 📞 获取帮助

如果在部署过程中遇到问题：

1. 查看[GitHub文档](https://docs.github.com/)
2. 在项目Issues中提问
3. 参考[Git教程](https://git-scm.com/docs)
4. 查看[Docker文档](https://docs.docker.com/)

---

**🎉 恭喜！您的IoT设备管理系统项目现在已经成功部署到GitHub！**