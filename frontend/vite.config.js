import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/**
 * Vite配置文件
 * 配置项目的构建过程和开发服务器
 */
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000,
    open: false,
    host: '0.0.0.0',
    allowedHosts: ['localhost', '192.168.10.139', 'mqtt.boningse.com',],
    cors: true,
    https: false,
    hmr: {
      host: 'localhost',
      protocol: 'ws'
    },
    proxy: {
      '/api': {
        target: process.env.BACKEND_PORT ? `http://127.0.0.1:${process.env.BACKEND_PORT}` : 'http://127.0.0.1:3003',
        changeOrigin: true,
        secure: false
      },
      '/ws': {
        target: process.env.BACKEND_PORT ? `ws://127.0.0.1:${process.env.BACKEND_PORT}` : 'ws://127.0.0.1:3003',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: undefined
      }
    }
  }
})
