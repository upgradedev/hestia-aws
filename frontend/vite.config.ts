import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3000,
    host: '127.0.0.1',
    proxy: {
      '/action': 'http://127.0.0.1:8000',
      '/healthz': 'http://127.0.0.1:8000',
      '/api': 'http://127.0.0.1:8000',
    },
  },
  build: {
    target: 'esnext',
    assetsDir: 'assets',
    sourcemap: false,
  },
});
