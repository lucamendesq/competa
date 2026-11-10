import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react({ babel: { plugins: ['babel-plugin-react-compiler'] } })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testing/setup.ts'],
    /* As specs de página montam as rotas reais, e o `import()` da tela é transformado dentro
     * do relógio do teste. Com um worker por arquivo disputando CPU, 5 s não bastam no CI. */
    testTimeout: 30_000,
    env: {
      VITE_API_URL: 'http://api.test',
      VITE_AUTH_URL: 'http://api.test/api/auth',
    },
  },
});
