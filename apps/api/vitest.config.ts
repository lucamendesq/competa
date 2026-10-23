import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
      },
    }),
  ],
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DB_NAME: process.env.DB_NAME ?? 'competa_test',
      LOG_LEVEL: 'error',
    },
  },
});
