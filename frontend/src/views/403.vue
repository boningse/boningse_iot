<template>
  <div class="error-page">
    <div class="error-container">
      <div class="error-icon">
        <el-icon :size="56">
          <Lock />
        </el-icon>
      </div>
      
      <div class="error-content">
        <h1 class="error-title">403</h1>
        <h2 class="error-subtitle">权限不足</h2>
        <p class="error-description">
          抱歉，您没有权限访问此页面。请联系管理员获取相应权限。
        </p>
        
        <div class="error-actions">
          <el-button type="primary" @click="goBack">
            <el-icon><ArrowLeft /></el-icon>
            返回上一页
          </el-button>
          <el-button @click="goHome">
            <el-icon><House /></el-icon>
            返回首页
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { Lock, ArrowLeft, House } from '@element-plus/icons-vue'

const router = useRouter()

/**
 * 返回上一页
 */
const goBack = () => {
  router.go(-1)
}

/**
 * 返回首页
 */
const goHome = () => {
  router.push('/')
}
</script>

<style lang="scss" scoped>
.error-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--app-bg);
  padding: 20px;
}

.error-container {
  text-align: center;
  background: var(--surface-color);
  border: 1px solid var(--border-light);
  border-top: 3px solid #d14d55;
  border-radius: 8px;
  padding: 42px 36px;
  box-shadow: var(--shadow-md);
  max-width: 500px;
  width: 100%;
}

.error-icon {
  margin-bottom: 18px;
  color: #d14d55;
}

.error-content {
  .error-title {
    font-size: 42px;
    font-weight: 700;
    color: #d14d55;
    margin: 0 0 10px 0;
  }
  
  .error-subtitle {
    font-size: 22px;
    color: var(--text-primary);
    margin: 0 0 20px 0;
    font-weight: 600;
  }
  
  .error-description {
    font-size: 1rem;
    color: var(--text-secondary);
    line-height: 1.6;
    margin: 0 0 40px 0;
  }
  
  .error-actions {
    display: flex;
    gap: 15px;
    justify-content: center;
    flex-wrap: wrap;
    
    .el-button {
      padding: 12px 24px;
      font-size: 14px;
      border-radius: 5px;
      
      .el-icon {
        margin-right: 5px;
      }
    }
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .error-container {
    padding: 40px 20px;
  }
  
  .error-content {
    .error-title {
      font-size: 36px;
    }
    
    .error-subtitle {
      font-size: 1.5rem;
    }
    
    .error-actions {
      flex-direction: column;
      align-items: center;
      
      .el-button {
        width: 200px;
      }
    }
  }
}
</style>
