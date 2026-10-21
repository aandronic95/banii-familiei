import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages servește aplicația la https://aandronic95.github.io/banii-familiei/
export default defineConfig({
  base: process.env.BASE_PATH || '/banii-familiei/',
  plugins: [vue()],
})
