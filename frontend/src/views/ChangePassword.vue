<template>
  <div class="change-password-page">
    <div class="change-password-container">
      <div class="header">
        <h2>修改密码</h2>
        <p class="subtitle">为了您的账户安全，请定期更换密码</p>
      </div>
      
      <el-form
        ref="changePasswordFormRef"
        :model="changePasswordForm"
        :rules="changePasswordRules"
        label-width="120px"
        label-position="left"
        class="change-password-form"
      >
        <el-form-item label="当前密码" prop="oldPassword">
          <el-input
            v-model="changePasswordForm.oldPassword"
            type="password"
            placeholder="请输入当前密码"
            show-password
            clearable
            size="large"
          />
        </el-form-item>
        
        <el-form-item label="新密码" prop="newPassword">
          <el-input
            v-model="changePasswordForm.newPassword"
            type="password"
            placeholder="请输入新密码"
            show-password
            clearable
            size="large"
          />
          <!-- 密码强度指示器 -->
          <div v-if="changePasswordForm.newPassword" class="password-strength">
            <div class="strength-bar">
              <div 
                class="strength-fill"
                :style="{
                  width: (getPasswordStrength.level / 3) * 100 + '%',
                  backgroundColor: getPasswordStrength.color
                }"
              ></div>
            </div>
            <span 
              class="strength-text"
              :style="{ color: getPasswordStrength.color }"
            >
              密码强度：{{ getPasswordStrength.text }}
            </span>
          </div>
        </el-form-item>
        
        <el-form-item label="确认密码" prop="confirmPassword">
          <el-input
            v-model="changePasswordForm.confirmPassword"
            type="password"
            placeholder="请再次输入新密码"
            show-password
            clearable
            size="large"
          />
        </el-form-item>
        
        <!-- 密码要求提示 -->
        <el-alert
          title="密码要求"
          type="info"
          :closable="false"
          show-icon
          class="password-requirements"
        >
          <ul>
            <li>密码长度为6-20位</li>
            <li>必须包含大写字母</li>
            <li>必须包含小写字母</li>
            <li>必须包含数字</li>
            <li>建议包含特殊字符以提高安全性</li>
          </ul>
        </el-alert>
        
        <div class="form-actions">
          <el-button size="large" @click="handleCancel">取消</el-button>
          <el-button 
            type="primary" 
            size="large" 
            :loading="submitLoading"
            @click="submitChangePassword"
          >
            确认修改
          </el-button>
        </div>
      </el-form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { authAPI } from '@/api'

const router = useRouter()

/**
 * 表单数据和状态
 */
const changePasswordForm = ref({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})

const submitLoading = ref(false)
const changePasswordFormRef = ref()

/**
 * 表单验证规则
 */
const changePasswordRules = {
  oldPassword: [
    { required: true, message: '请输入当前密码', trigger: 'blur' }
  ],
  newPassword: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, max: 20, message: '密码长度应为6-20位', trigger: 'blur' },
    {
      pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{6,}$/,
      message: '密码必须包含大小写字母和数字',
      trigger: 'blur'
    }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码', trigger: 'blur' },
    {
      validator: (rule, value, callback) => {
        if (value !== changePasswordForm.value.newPassword) {
          callback(new Error('两次输入的密码不一致'))
        } else {
          callback()
        }
      },
      trigger: 'blur'
    }
  ]
}

/**
 * 计算密码强度
 */
const getPasswordStrength = computed(() => {
  const password = changePasswordForm.value.newPassword
  if (!password) return { level: 0, text: '', color: '' }
  
  let score = 0
  
  // 长度检查
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  
  // 字符类型检查
  if (/[a-z]/.test(password)) score += 1
  if (/[A-Z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^a-zA-Z\d]/.test(password)) score += 1
  
  if (score <= 2) {
    return { level: 1, text: '弱', color: '#f56c6c' }
  } else if (score <= 4) {
    return { level: 2, text: '中', color: '#e6a23c' }
  } else {
    return { level: 3, text: '强', color: '#67c23a' }
  }
})

/**
 * 提交修改密码
 */
const submitChangePassword = async () => {
  try {
    await changePasswordFormRef.value.validate()
    
    submitLoading.value = true
    
    const response = await authAPI.changePassword({
      oldPassword: changePasswordForm.value.oldPassword,
      newPassword: changePasswordForm.value.newPassword
    })
    
    if (response.success) {
      ElMessage.success('密码修改成功，请重新登录')
      
      // 重置表单
      changePasswordForm.value = {
        oldPassword: '',
        newPassword: '',
        confirmPassword: ''
      }
      
      // 清除登录状态并跳转到登录页
      localStorage.removeItem('token')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('userInfo')
      
      setTimeout(() => {
        router.push('/login')
      }, 1500)
    } else {
      ElMessage.error(response.message || '密码修改失败')
    }
  } catch (error) {
    if (error !== 'cancel') {
      console.error('密码修改失败:', error)
      ElMessage.error('修改密码失败，请稍后重试')
    }
  } finally {
    submitLoading.value = false
  }
}

/**
 * 取消修改
 */
const handleCancel = async () => {
  try {
    await ElMessageBox.confirm(
      '确定要取消修改密码吗？已输入的内容将会丢失。',
      '取消确认',
      {
        confirmButtonText: '确定',
        cancelButtonText: '继续修改',
        type: 'warning'
      }
    )
    
    // 重置表单
    changePasswordForm.value = {
      oldPassword: '',
      newPassword: '',
      confirmPassword: ''
    }
    changePasswordFormRef.value?.clearValidate()
    
    // 返回上一页或首页
    router.back()
  } catch {
    // 用户取消
  }
}
</script>

<style lang="scss" scoped>
.change-password-page {
  min-height: 100vh;
  background: var(--app-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.change-password-container {
  background: var(--surface-color);
  border: 1px solid var(--border-light);
  border-top: 3px solid var(--primary-color);
  border-radius: 8px;
  box-shadow: var(--shadow-md);
  padding: 40px;
  width: 100%;
  max-width: 500px;
  
  .header {
    text-align: center;
    margin-bottom: 30px;
    
    h2 {
      color: var(--text-primary);
      font-size: 28px;
      font-weight: 600;
      margin: 0 0 8px 0;
    }
    
    .subtitle {
      color: var(--text-secondary);
      font-size: 14px;
      margin: 0;
    }
  }
}

.change-password-form {
  .el-form-item {
    margin-bottom: 24px;
    
    :deep(.el-form-item__label) {
      color: var(--text-primary);
      font-weight: 500;
    }
  }
  
  .password-strength {
    margin-top: 8px;
    
    .strength-bar {
      width: 100%;
      height: 4px;
      background-color: var(--fill-light);
      border-radius: 2px;
      overflow: hidden;
      margin-bottom: 4px;
      
      .strength-fill {
        height: 100%;
        transition: all 0.3s ease;
        border-radius: 2px;
      }
    }
    
    .strength-text {
      font-size: 12px;
      font-weight: 500;
    }
  }
  
  .password-requirements {
    margin-bottom: 24px;
    
    :deep(.el-alert__content) {
      ul {
        margin: 8px 0 0 0;
        padding-left: 16px;
        
        li {
          font-size: 13px;
          color: var(--text-regular);
          margin-bottom: 4px;
          
          &:last-child {
            margin-bottom: 0;
          }
        }
      }
    }
  }
  
  .form-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-top: 32px;
    
    .el-button {
      min-width: 120px;
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .change-password-page {
    padding: 10px;
  }
  
  .change-password-container {
    padding: 24px;
    
    .header h2 {
      font-size: 24px;
    }
  }
  
  .change-password-form {
    .form-actions {
      flex-direction: column;
      
      .el-button {
        width: 100%;
      }
    }
  }
}
</style>
