import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/projects': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/analyze': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/hardware': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/circuit-diagram': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/code': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})