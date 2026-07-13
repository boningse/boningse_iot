<template>
  <div class="login-container">
    <div class="login-wrapper">
      <div class="login-left">
        <div class="login-bg">
          <div class="bg-content">
            <h1>物联网设备管理系统</h1>
            <p>智能设备 · 高效管理 · 数据驱动</p>
            <div class="feature-list">
              <div class="feature-item">
                <el-icon><Monitor /></el-icon>
                <span>设备实时监控</span>
              </div>
              <div class="feature-item">
                <el-icon><DataAnalysis /></el-icon>
                <span>数据分析统计</span>
              </div>
              <div class="feature-item">
                <el-icon><Connection /></el-icon>
                <span>MQTT消息管理</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div class="login-right">
        <div class="login-form-container">
          <div class="login-header">
            <img src="../assets/logo.svg" alt="Logo" class="logo" />
            <h2>用户登录</h2>
            <p>欢迎使用物联网设备管理系统</p>
          </div>
          
          <el-form
            ref="loginFormRef"
            :model="loginForm"
            :rules="loginRules"
            class="login-form"
            @keyup.enter="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model="loginForm.username"
                placeholder="请输入用户名"
                size="large"
                clearable
              >
                <template #prefix>
                  <el-icon><User /></el-icon>
                </template>
              </el-input>
            </el-form-item>
            
            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                type="password"
                placeholder="请输入密码"
                size="large"
                show-password
                clearable
              >
                <template #prefix>
                  <el-icon><Lock /></el-icon>
                </template>
              </el-input>
            </el-form-item>
            
            <el-form-item prop="captcha" v-if="showCaptcha">
              <div class="captcha-container">
                <el-input
                  v-model="loginForm.captcha"
                  placeholder="请输入验证码"
                  size="large"
                  clearable
                  style="flex: 1; margin-right: 10px;"
                >
                  <template #prefix>
                    <el-icon><Key /></el-icon>
                  </template>
                </el-input>
                <div class="captcha-image" @click="refreshCaptcha">
                  <span>{{ captchaText }}</span>
                </div>
              </div>
            </el-form-item>
            
            <el-form-item>
              <div class="login-options">
                <el-checkbox v-model="rememberMe">记住密码</el-checkbox>
                <el-link type="primary" @click="showForgotPassword">忘记密码？</el-link>
              </div>
            </el-form-item>
            
            <el-form-item>
              <el-button
                type="primary"
                size="large"
                class="login-button"
                :loading="loginLoading"
                @click="handleLogin"
              >
                {{ loginLoading ? '登录中...' : '登录' }}
              </el-button>
            </el-form-item>
          </el-form>
          
          <div class="login-footer">
            <p>还没有账号？<el-link type="primary" @click="showRegister">立即注册</el-link></p>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 忘记密码对话框 -->
    <el-dialog
      v-model="forgotPasswordVisible"
      title="找回密码"
      width="400px"
      @close="resetForgotForm"
    >
      <el-form
        ref="forgotFormRef"
        :model="forgotForm"
        :rules="forgotRules"
        label-width="80px"
      >
        <el-form-item label="用户名" prop="username">
          <el-input v-model="forgotForm.username" placeholder="请输入用户名" />
        </el-form-item>
        <el-form-item label="邮箱" prop="email">
          <el-input v-model="forgotForm.email" placeholder="请输入注册邮箱" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="forgotPasswordVisible = false">取消</el-button>
          <el-button type="primary" @click="handleForgotPassword" :loading="forgotLoading">
            发送重置邮件
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { authAPI } from '@/api'

const router = useRouter()

/**
 * 登录表单数据
 */
const loginForm = reactive({
  username: '',
  password: '',
  captcha: ''
})

/**
 * 表单引用
 */
const loginFormRef = ref(null)
const forgotFormRef = ref(null)

/**
 * 登录状态
 */
const loginLoading = ref(false)
const rememberMe = ref(false)
const showCaptcha = ref(false)
const captchaText = ref('')

/**
 * 忘记密码相关
 */
const forgotPasswordVisible = ref(false)
const forgotLoading = ref(false)
const forgotForm = reactive({
  username: '',
  email: ''
})

/**
 * 登录表单验证规则
 */
const loginRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 20, message: '用户名长度在 3 到 20 个字符', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度在 6 到 20 个字符', trigger: 'blur' }
  ],
  captcha: [
    { required: true, message: '请输入验证码', trigger: 'blur' },
    { len: 4, message: '验证码为4位字符', trigger: 'blur' }
  ]
}

/**
 * 忘记密码表单验证规则
 */
const forgotRules = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' }
  ],
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ]
}

/**
 * 生成验证码
 */
const generateCaptcha = () => {
  const chars = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678'
  let result = ''
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  captchaText.value = result
}

/**
 * 刷新验证码
 */
const refreshCaptcha = () => {
  generateCaptcha()
  loginForm.captcha = ''
}

/**
 * 处理登录
 */
const handleLogin = async () => {
  if (!loginFormRef.value) return
  
  try {
    await loginFormRef.value.validate()
    
    // 验证码校验
    if (showCaptcha.value && loginForm.captcha.toLowerCase() !== captchaText.value.toLowerCase()) {
      ElMessage.error('验证码错误')
      refreshCaptcha()
      return
    }
    
    loginLoading.value = true
    
    // 调用真实的登录API
    const response = await authAPI.login({
      username: loginForm.username,
      password: loginForm.password
    })
    
    if (response.success) {
      // 保存登录状态和用户信息
      localStorage.setItem('token', response.data.token)
      localStorage.setItem('refreshToken', response.data.refreshToken)
      localStorage.setItem('isLoggedIn', 'true')
      localStorage.setItem('userInfo', JSON.stringify(response.data.user))
      
      if (rememberMe.value) {
        localStorage.setItem('rememberedUsername', loginForm.username)
      } else {
        localStorage.removeItem('rememberedUsername')
      }
      
      ElMessage.success(response.message || '登录成功')
      
      // 跳转到首页
      router.push('/')
    } else {
      ElMessage.error(response.message || '登录失败')
      showCaptcha.value = true
      refreshCaptcha()
    }
  } catch (error) {
    console.error('登录失败:', error)
    ElMessage.error(error.message || '登录失败，请检查网络连接')
    showCaptcha.value = true
    refreshCaptcha()
  } finally {
    loginLoading.value = false
  }
}

/**
 * 显示忘记密码对话框
 */
const showForgotPassword = () => {
  forgotPasswordVisible.value = true
}

/**
 * 处理忘记密码
 */
const handleForgotPassword = async () => {
  if (!forgotFormRef.value) return
  
  try {
    await forgotFormRef.value.validate()
    
    forgotLoading.value = true
    
    // 模拟发送重置邮件
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    ElMessage.success('重置密码邮件已发送，请查收邮箱')
    forgotPasswordVisible.value = false
  } catch (error) {
    console.log('表单验证失败:', error)
  } finally {
    forgotLoading.value = false
  }
}

/**
 * 重置忘记密码表单
 */
const resetForgotForm = () => {
  if (forgotFormRef.value) {
    forgotFormRef.value.resetFields()
  }
  Object.assign(forgotForm, {
    username: '',
    email: ''
  })
}

/**
 * 显示注册页面
 */
const showRegister = () => {
  ElMessage.info('注册功能开发中...')
}

/**
 * 组件挂载时初始化
 */
onMounted(() => {
  // 检查是否有记住的用户名
  const rememberedUsername = localStorage.getItem('rememberedUsername')
  if (rememberedUsername) {
    loginForm.username = rememberedUsername
    rememberMe.value = true
  }
  
  // 生成验证码
  generateCaptcha()
  
  // 检查是否已登录
  const isLoggedIn = localStorage.getItem('isLoggedIn')
  if (isLoggedIn === 'true') {
    router.push('/')
  }
})
</script>

<style lang="scss" scoped>
.login-container {
  min-height: 100vh;
  background-color: var(--app-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-wrapper {
  width: 100%;
  max-width: 520px;
  background: var(--surface-color);
  border: 1px solid var(--border-light);
  border-top: 3px solid var(--primary-color);
  border-radius: 8px;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  display: block;
  min-height: 0;
}

.login-left {
  background: var(--sidebar-bg);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  
  .login-bg {
    width: 100%;
    padding: 28px 36px 24px;
    color: #edf4f3;
    
    .bg-content {
      h1 {
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 8px;
      }
      
      p {
        font-size: 13px;
        margin: 0 0 20px;
        color: #a9bbb8;
      }
      
      .feature-list {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;

        .feature-item {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin: 0;
          font-size: 12px;
          color: #c7d2d0;
          
          .el-icon {
            margin-right: 0.5rem;
            font-size: 15px;
          }
        }
      }
    }
  }
}

.login-right {
  padding: 34px 42px 28px;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.login-form-container {
  width: 100%;
  max-width: 400px;
  margin: 0 auto;
}

.login-header {
  text-align: center;
  margin-bottom: 24px;
  
  .logo {
    width: 44px;
    height: 44px;
    margin-bottom: 10px;
  }
  
  h2 {
    font-size: 21px;
    font-weight: 650;
    color: var(--text-primary);
    margin: 0 0 6px;
  }
  
  p {
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.login-form {
  .el-form-item {
    margin-bottom: 1.5rem;
  }
  
  .captcha-container {
    display: flex;
    align-items: center;
    
    .captcha-image {
      width: 100px;
      height: 40px;
      background: var(--fill-lighter);
      border: 1px solid var(--border-color);
      border-radius: 5px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      font-weight: bold;
      color: var(--primary-color);
      -webkit-user-select: none;
      user-select: none;
      
      &:hover {
        background: var(--fill-light);
      }
    }
  }
  
  .login-options {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  
  .login-button {
    width: 100%;
    height: 45px;
    font-size: 1rem;
    font-weight: 600;
  }
}

.login-footer {
  text-align: center;
  margin-top: 1.5rem;
  
  p {
    color: var(--text-secondary);
    font-size: 0.9rem;
  }
}

.dialog-footer {
  text-align: right;
}

// 响应式设计
@media (max-width: 768px) {
  .login-container {
    align-items: flex-start;
    padding: 12px;
  }

  .login-wrapper {
    max-width: 440px;
    margin-top: 4vh;
  }
  
  .login-left {
    min-height: 0;
    
    .bg-content {
      h1 {
        font-size: 20px;
      }
      
      p {
        font-size: 1rem;
      }
      
      .feature-list {
        grid-template-columns: 1fr;
        gap: 6px;
      }
    }
  }
  
  .login-right {
    padding: 28px 22px 22px;
  }
}
</style>
