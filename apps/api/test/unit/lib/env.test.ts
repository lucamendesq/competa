import 'dotenv/config';

import { afterEach, expect, test, vi } from 'vitest';

/** `config/env.ts` valida na importação e lança: por isso cada caso reimporta o módulo
 *  com `vi.resetModules()` e um `process.env` montado à mão. */
/** o snapshot vem DEPOIS do `dotenv/config` acima: é o ambiente que o módulo real vê */
const original = { ...process.env };

const loadEnv = async (overrides: Record<string, string | undefined>) => {
  process.env = { ...original, ...overrides } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }

  vi.resetModules();
  const module = await import('../../../src/config/env.js');

  return module.default;
};

afterEach(() => {
  process.env = { ...original };
  vi.resetModules();
});

test('variável obrigatória ausente derruba a subida nomeando a variável', async () => {
  await expect(loadEnv({ DB_HOST: undefined })).rejects.toThrow(/DB_HOST/);
  await expect(loadEnv({ BETTER_AUTH_SECRET: undefined })).rejects.toThrow(
    /BETTER_AUTH_SECRET/,
  );
});

test('WEB_URL inválida é recusada (o link do email nasce dela)', async () => {
  await expect(loadEnv({ WEB_URL: 'nao-e-url' })).rejects.toThrow(/WEB_URL/);
});

test('defaults: PORT 3000, INVITE_TTL_DAYS 7, UPLOAD_LINK_TTL_DAYS 30', async () => {
  const env = await loadEnv({
    PORT: undefined,
    INVITE_TTL_DAYS: undefined,
    UPLOAD_LINK_TTL_DAYS: undefined,
  });

  expect(env.PORT).toBe(3000);
  expect(env.INVITE_TTL_DAYS).toBe(7);
  expect(env.UPLOAD_LINK_TTL_DAYS).toBe(30);
});

test('valores numéricos vindos do ambiente chegam como número', async () => {
  const env = await loadEnv({ PORT: '4321', INVITE_TTL_DAYS: '3', UPLOAD_LINK_TTL_DAYS: '10' });

  expect(env.PORT).toBe(4321);
  expect(env.INVITE_TTL_DAYS).toBe(3);
  expect(env.UPLOAD_LINK_TTL_DAYS).toBe(10);
});

test('sem RESEND_API_KEY o env sobe (o módulo cai no LogEmail) e EMAIL_FROM tem default', async () => {
  const env = await loadEnv({ RESEND_API_KEY: undefined });

  expect(env.RESEND_API_KEY).toBeUndefined();
  expect(env.EMAIL_FROM).toMatch(/@/);
});
