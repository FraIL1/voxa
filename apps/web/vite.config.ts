import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Vite собирает shared из исходников: CJS-dist пакета Rollup
      // не разбирает (__exportStar), а исходники дают hot-reload в dev
      '@voxa/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    // Явный IPv4: на Windows «localhost» может забиндиться только на ::1,
    // и IPv4-клиенты не достучатся
    host: '127.0.0.1',
    port: 5173,
    // Same-origin с бэкендом: cookie и WebSocket работают без CORS
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/socket.io': { target: 'http://127.0.0.1:3000', ws: true },
    },
  },
});
