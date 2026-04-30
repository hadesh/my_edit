import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Vite 配置 - Tauri 集成专用
export default defineConfig({
  plugins: [react()],
  base: './',  // Tauri 需要相对路径，不能是 '/'
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  // 清除控制台警告
  clearScreen: false,
})