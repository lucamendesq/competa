import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      /* A conexão inteira vem do shell (CI) ou do Postgres do docker-compose, nunca do .env:
       * ele é gerado do .env.template e aponta para o banco do staging. */
      DB_HOST: process.env.DB_HOST ?? 'localhost',
      DB_PORT: process.env.DB_PORT ?? '5432',
      DB_USER: process.env.DB_USER ?? 'postgres',
      DB_PASS: process.env.DB_PASS ?? '',
      DB_NAME: process.env.DB_NAME ?? 'competa_test',
      DB_SSL_CA: process.env.DB_SSL_CA ?? '',
      LOG_LEVEL: 'error',
      /* As suites congelam a recusa dos webhooks SEM segredo; um .env de dev com os
       * tokens preenchidos não pode mudar isso (blankAsMissing trata '' como ausente). */
      ASAAS_WEBHOOK_TOKEN: '',
      WHATSAPP_VERIFY_TOKEN: '',
      /* Idem para o segredo da Meta: a suíte congela o 503 do webhook sem ele, e antes disto
       * a garantia era "o .env do dev não tem essa linha" — quem a preenchesse quebrava a
       * suíte, e só na máquina dele. */
      META_APP_SECRET: '',
      /* Chave de teste, fixa para o cifrado ser reproduzível entre runs. O serviço deixou
       * de ter fallback: sem isto o app nem sobe. */
      WHATSAPP_ENCRYPTION_KEY: 'a'.repeat(64),
      /* Diretório próprio, apagado a cada run: apontar para o `.storage` do dev fazia cada
       * execução deixar lixo lá (chegou a 4,3 GB / ~5 mil arquivos) e ainda exercitava a
       * faxina de órfãos do cron contra sobras de runs antigas. */
      STORAGE_LOCAL_DIR: '.storage-test',
    },
    globalSetup: ['./test/support/global-setup.ts'],
    setupFiles: ['./test/support/pool-teardown.ts'],
  },
});
