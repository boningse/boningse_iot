<template>
  <div class="app-container">
    <router-view />
  </div>
</template>

<script setup>
// Element Plus已在main.js中全局配置，无需重复配置
</script>

<style lang="scss">
.app-container {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>