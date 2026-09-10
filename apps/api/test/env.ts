/** Precisa rodar ANTES de qualquer import que leia `config/env.ts`. */
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'competa_test';
process.env.BETTER_AUTH_SECRET ??= 'segredo-de-teste-com-tamanho-suficiente';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3999';
process.env.WEB_URL ??= 'http://localhost:4200';
process.env.PORT ??= '3999';
process.env.STORAGE_LOCAL_DIR = process.env.STORAGE_LOCAL_DIR ?? '.storage-test';
// sem chave: o MessagingModule cai no LogEmail e nada sai para a internet
delete process.env.RESEND_API_KEY;
// sem R2: o StorageModule usa disco
delete process.env.R2_ACCOUNT_ID;
delete process.env.R2_ACCESS_KEY_ID;
delete process.env.R2_SECRET_ACCESS_KEY;
delete process.env.R2_BUCKET;
