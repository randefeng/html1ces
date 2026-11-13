import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '0.0.0.0',
    proxy: {
      '/ws': { target: 'http://127.0.0.1:3001', ws: true },
      '/health': { target: 'http://127.0.0.1:3001' },
    },
  },
});
