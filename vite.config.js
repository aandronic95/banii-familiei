import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// GitHub Pages servește aplicația la https://<cont>.github.io/<depozit>/ (BASE_PATH vine din workflow)
export default defineConfig({
  base: process.env.BASE_PATH || '/banii-familiei/',
  plugins: [vue()],
})
