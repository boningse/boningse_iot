import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

import App from './App.vue'
import router from './router'
import './styles/global.scss'

const savedTheme = localStorage.getItem('theme')
const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
const useDarkTheme = savedTheme ? savedTheme === 'dark' : prefersDark
document.documentElement.classList.toggle('dark', useDarkTheme)
document.documentElement.style.colorScheme = useDarkTheme ? 'dark' : 'light'

/**
 * 创建Vue应用实例并配置全局插件
 */
const app = createApp(App)

// 注册Element Plus图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

// 配置插件
app.use(createPinia())
app.use(router)
app.use(ElementPlus, {
  locale: zhCn,
})

// 挂载应用
app.mount('#app')
