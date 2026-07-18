import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 3000,
    // 如需开发环境代理底图 API，请在本地启动反向代理后在此配置
  },
})
