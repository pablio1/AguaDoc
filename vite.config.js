// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Backend uses PORT=5050 locally (macOS AirPlay occupies 5000)
      '/api': 'http://localhost:5050',
    },
  },
})