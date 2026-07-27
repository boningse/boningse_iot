# 贡献指南

感谢您对IoT设备管理系统的贡献！我们欢迎所有形式的贡献，包括但不限于代码、文档、测试、反馈和建议。

## 📋 目录

- [行为准则](#行为准则)
- [如何贡献](#如何贡献)
- [开发流程](#开发流程)
- [代码规范](#代码规范)
- [提交规范](#提交规范)
- [Pull Request流程](#pull-request流程)
- [Issue指南](#issue指南)
- [开发环境搭建](#开发环境搭建)
- [测试指南](#测试指南)
- [文档贡献](#文档贡献)

## 🤝 行为准则

参与此项目即表示您同意遵守我们的行为准则：

- 使用友好和包容的语言
- 尊重不同的观点和经验
- 优雅地接受建设性批评
- 专注于对社区最有利的事情
- 对其他社区成员表示同理心

## 🚀 如何贡献

您可以通过以下方式为项目做出贡献：

### 🐛 报告Bug
- 使用[Bug报告模板](.github/ISSUE_TEMPLATE/bug_report.md)
- 提供详细的复现步骤
- 包含环境信息和错误日志

### ✨ 建议新功能
- 使用[功能请求模板](.github/ISSUE_TEMPLATE/feature_request.md)
- 详细描述功能需求和使用场景
- 考虑技术实现的可行性

### 📝 改进文档
- 修复文档中的错误
- 添加缺失的文档
- 改善文档的清晰度和可读性

### 💻 贡献代码
- 修复已知的Bug
- 实现新功能
- 优化性能
- 重构代码

### 🧪 改进测试
- 添加单元测试
- 改进集成测试
- 提高测试覆盖率

## 🔄 开发流程

### 1. Fork项目

```bash
# 1. Fork项目到您的GitHub账户
# 2. 克隆您的Fork
git clone https://github.com/your-username/iot-device-management.git
cd iot-device-management

# 3. 添加上游仓库
git remote add upstream https://github.com/original-owner/iot-device-management.git
```

### 2. 创建功能分支

```bash
# 确保在最新的main分支
git checkout main
git pull upstream main

# 创建新的功能分支
git checkout -b feature/your-feature-name
# 或者修复分支
git checkout -b fix/your-bug-fix
```

### 3. 开发和测试

```bash
# 安装依赖
npm install
cd backend && npm install && cd ..

# 启动开发环境
make dev-up

# 进行开发...

# 运行测试
npm test
cd backend && npm test

# 运行集成测试
./docker-test.sh
```

### 4. 提交代码

```bash
# 添加变更
git add .

# 提交（遵循提交规范）
git commit -m "feat: add new device monitoring feature"

# 推送到您的Fork
git push origin feature/your-feature-name
```

### 5. 创建Pull Request

1. 在GitHub上打开您的Fork
2. 点击"New Pull Request"
3. 填写PR模板
4. 等待代码审查

## 📏 代码规范

### JavaScript/Vue.js规范

```javascript
// 使用ES6+语法
const apiUrl = process.env.VUE_APP_API_URL;

// 使用箭头函数
const fetchData = async () => {
  try {
    const response = await api.get('/devices');
    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};

// Vue组件使用Composition API
import { ref, onMounted } from 'vue';

export default {
  name: 'DeviceList',
  setup() {
    const devices = ref([]);
    
    const loadDevices = async () => {
      devices.value = await fetchData();
    };
    
    onMounted(() => {
      loadDevices();
    });
    
    return {
      devices,
      loadDevices
    };
  }
};
```

### Node.js后端规范

```javascript
// 使用async/await
const getDevices = async (req, res) => {
  try {
    const { tenantId } = req.user;
    const devices = await deviceService.getDevicesByTenant(tenantId);
    
    res.json({
      success: true,
      data: devices
    });
  } catch (error) {
    logger.error('Error getting devices:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// 使用适当的错误处理
const validateDevice = (device) => {
  if (!device.name) {
    throw new ValidationError('Device name is required');
  }
  if (!device.type) {
    throw new ValidationError('Device type is required');
  }
};
```

### CSS/SCSS规范

```scss
// 使用BEM命名规范
.device-card {
  padding: 16px;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  
  &__header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  
  &__title {
    font-size: 18px;
    font-weight: 600;
    color: #333;
  }
  
  &__status {
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    
    &--online {
      background-color: #e8f5e8;
      color: #2e7d32;
    }
    
    &--offline {
      background-color: #ffebee;
      color: #c62828;
    }
  }
}
```

## 📝 提交规范

我们使用[Conventional Commits](https://www.conventionalcommits.org/)规范：

```
type(scope): description

[optional body]

[optional footer]
```

### 提交类型

- `feat`: 新功能
- `fix`: Bug修复
- `docs`: 文档更新
- `style`: 代码格式（不影响代码运行的变动）
- `refactor`: 重构（既不是新增功能，也不是修改bug的代码变动）
- `perf`: 性能优化
- `test`: 增加测试
- `chore`: 构建过程或辅助工具的变动
- `ci`: CI配置文件和脚本的变动
- `build`: 影响构建系统或外部依赖的变动

### 示例

```bash
# 新功能
git commit -m "feat(devices): add real-time status monitoring"

# Bug修复
git commit -m "fix(auth): resolve JWT token expiration issue"

# 文档更新
git commit -m "docs(readme): update installation instructions"

# 重构
git commit -m "refactor(api): simplify device data structure"

# 性能优化
git commit -m "perf(database): optimize device query performance"
```

## 🔍 Pull Request流程

### PR检查清单

提交PR前请确认：

- [ ] 代码遵循项目编码规范
- [ ] 已添加/更新相关测试
- [ ] 所有测试通过
- [ ] 已更新相关文档
- [ ] 提交信息遵循规范
- [ ] 已解决所有merge冲突
- [ ] PR描述清晰完整

### 代码审查

所有PR都需要经过代码审查：

1. **自动检查**: CI/CD流水线会自动运行测试
2. **人工审查**: 至少需要一位维护者的审查
3. **反馈处理**: 根据审查意见修改代码
4. **合并**: 审查通过后合并到主分支

### 审查标准

- 代码质量和可读性
- 功能正确性
- 性能影响
- 安全性考虑
- 测试覆盖率
- 文档完整性

## 📋 Issue指南

### 创建Issue前

1. 搜索现有Issue，避免重复
2. 确认问题确实存在
3. 收集相关信息

### Issue质量标准

- 使用适当的模板
- 提供清晰的标题
- 详细描述问题或需求
- 包含复现步骤（Bug报告）
- 提供环境信息
- 添加相关标签

## 🛠️ 开发环境搭建

### 系统要求

- Node.js 18+
- Docker 20.10+
- Docker Compose 2.0+
- Git 2.0+

### 快速开始

```bash
# 1. 克隆项目
git clone https://github.com/your-username/iot-device-management.git
cd iot-device-management

# 2. 安装依赖
npm install
cd backend && npm install && cd ..

# 3. 配置环境
cp .env.docker .env
# 编辑.env文件，设置必要的环境变量

# 4. 启动开发环境
make dev-up

# 5. 访问应用
# 前端: http://localhost:8080
# 后端: http://localhost:3003
```

### IDE配置

推荐使用VS Code，并安装以下扩展：

- Vue Language Features (Volar)
- ESLint
- Prettier
- Docker
- GitLens

### 调试配置

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Backend",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/backend/app.js",
      "env": {
        "NODE_ENV": "development"
      }
    }
  ]
}
```

## 🧪 测试指南

### 测试类型

1. **单元测试**: 测试单个函数或组件
2. **集成测试**: 测试模块间的交互
3. **端到端测试**: 测试完整的用户流程

### 运行测试

```bash
# 前端测试
npm test
npm run test:coverage

# 后端测试
cd backend
npm test
npm run test:coverage

# 集成测试
./docker-test.sh

# 性能测试
npm run test:performance
```

### 测试编写规范

```javascript
// 前端组件测试
import { mount } from '@vue/test-utils';
import DeviceCard from '@/components/DeviceCard.vue';

describe('DeviceCard', () => {
  it('should display device name', () => {
    const device = { name: 'Test Device', status: 'online' };
    const wrapper = mount(DeviceCard, {
      props: { device }
    });
    
    expect(wrapper.text()).toContain('Test Device');
  });
});

// 后端API测试
const request = require('supertest');
const app = require('../app');

describe('GET /api/devices', () => {
  it('should return devices list', async () => {
    const response = await request(app)
      .get('/api/devices')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);
    
    expect(response.body.success).toBe(true);
    expect(Array.isArray(response.body.data)).toBe(true);
  });
});
```

## 📚 文档贡献

### 文档类型

- **README**: 项目概述和快速开始
- **API文档**: 接口说明和示例
- **用户指南**: 功能使用说明
- **开发文档**: 技术实现细节
- **部署指南**: 部署和运维说明

### 文档规范

- 使用Markdown格式
- 保持结构清晰
- 提供代码示例
- 包含截图说明
- 及时更新内容

### 文档结构

```
docs/
├── api/                 # API文档
│   ├── authentication.md
│   ├── devices.md
│   └── data.md
├── user-guide/          # 用户指南
│   ├── getting-started.md
│   ├── device-management.md
│   └── data-monitoring.md
├── development/         # 开发文档
│   ├── architecture.md
│   ├── database-schema.md
│   └── coding-standards.md
└── deployment/          # 部署文档
    ├── docker.md
    ├── production.md
    └── troubleshooting.md
```

## 🏷️ 版本发布

### 版本号规范

我们使用[语义化版本](https://semver.org/)：

- `MAJOR.MINOR.PATCH`
- `MAJOR`: 不兼容的API修改
- `MINOR`: 向下兼容的功能性新增
- `PATCH`: 向下兼容的问题修正

### 发布流程

1. 更新版本号
2. 更新CHANGELOG
3. 创建Release标签
4. 发布到GitHub Releases
5. 更新Docker镜像

## 🤔 获取帮助

如果您在贡献过程中遇到问题：

1. 查看现有的Issues和Discussions
2. 阅读项目文档
3. 在Discussions中提问
4. 联系项目维护者

## 🙏 致谢

感谢所有为这个项目做出贡献的开发者！您的贡献让这个项目变得更好。

---

**再次感谢您的贡献！** 🎉