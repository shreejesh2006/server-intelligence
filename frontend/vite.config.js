import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://192.168.64.22:8000',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://192.168.64.22:8000',
        changeOrigin: true,
      },
    },
  },
});
