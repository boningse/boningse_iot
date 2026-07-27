<template>
  <el-breadcrumb separator="/" class="breadcrumb">
    <el-breadcrumb-item :to="{ path: '/' }">首页</el-breadcrumb-item>
    <el-breadcrumb-item v-for="item in breadcrumbList" :key="item.path">
      {{ item.meta.title }}
    </el-breadcrumb-item>
  </el-breadcrumb>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'

/**
 * 面包屑导航组件
 * 根据当前路由自动生成面包屑导航
 */
const route = useRoute()

/**
 * 生成面包屑列表
 */
const breadcrumbList = computed(() => {
  const matched = route.matched.filter(item => item.meta && item.meta.title)
  return matched
})
</script>

<style lang="scss" scoped>
.breadcrumb {
  font-size: 14px;
  
  :deep(.el-breadcrumb__inner) {
    color: var(--text-regular);
    
    &.is-link {
      color: var(--primary-color);
    }
  }
}
</style>