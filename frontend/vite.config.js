import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: '/TJMJ/',
  server: {
    allowedHosts: ['.loca.lt', '.ngrok-free.dev']
  }
})