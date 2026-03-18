import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/public',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/users': 'http://localhost:3000',
      '/sync': 'http://localhost:3000',
    },
  },
})
