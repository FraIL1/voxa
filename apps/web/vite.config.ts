import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

/** Куда проксировать API в dev: обычный бэкенд или стенд UI-тестов */
const API_TARGET = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Крупные зависимости — отдельными чанками (кэш браузера + без warning)
        manualChunks: {
          vendor: [
            'react',
            'react-dom',
            'react-router',
            '@tanstack/react-query',
            'zustand',
            'socket.io-client',
            'i18next',
            'react-i18next',
          ],
          markdown: ['react-markdown', 'remark-gfm'],
        },
      },
    },
  },
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
    // Same-origin с бэкендом: cookie и WebSocket работают без CORS.
    // Адрес бэкенда параметризован: UI-тесты поднимают свой на другом порту.
    proxy: {
      '/api': API_TARGET,
      '/socket.io': { target: API_TARGET, ws: true },
    },
  },
});
