import { defineConfig } from 'vitest/config';

/** Testes rodam contra o banco `contabilidade_test`, migrado de banco vazio pelas mesmas
 *  migrations de produção.
 *
 *  `fileParallelism: false` é OBRIGATÓRIO, não preferência: os arquivos compartilham o
 *  banco e a porta da app (a URL pré-assinada do storage local aponta para `env.PORT`).
 *  Em paralelo dá `EADDRINUSE` e `deadlock detected` no `truncate cascade` — e o sintoma
 *  parece teste instável, não configuração errada. (`maxForks: 1` NÃO serializa arquivos
 *  no Vitest 4.) */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    pool: 'forks',
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/infra/database/seeds/**'],
    },
  },
});
