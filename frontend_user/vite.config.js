import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    open: true,
    watch: {
      // Prevent clearing localStorage during HMR
      usePolling: false,
      interval: 1000
    }
  },
  // Prevent clearing localStorage during development
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV === 'development')
  }
})
