import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 60000,
    env: {
      NODE_ENV: 'test',
      DB_NAME: process.env.DB_NAME ?? 'competa_test',
      LOG_LEVEL: 'error',
      /* As suites congelam a recusa dos webhooks SEM segredo; um .env de dev com os
       * tokens preenchidos não pode mudar isso (blankAsMissing trata '' como ausente). */
      ASAAS_WEBHOOK_TOKEN: '',
      WHATSAPP_VERIFY_TOKEN: '',
      /* Diretório próprio, apagado a cada run: apontar para o `.storage` do dev fazia cada
       * execução deixar lixo lá (chegou a 4,3 GB / ~5 mil arquivos) e ainda exercitava a
       * faxina de órfãos do cron contra sobras de runs antigas. */
      STORAGE_LOCAL_DIR: '.storage-test',
    },
    globalSetup: ['./test/support/global-setup.ts'],
  },
});
