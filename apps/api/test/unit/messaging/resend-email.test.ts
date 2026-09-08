import 'dotenv/config';

import { afterEach, expect, test, vi } from 'vitest';

/** O `dotenv/config` acima é obrigatório: `vi.resetModules()` não recarrega dependência de
 *  `node_modules`, então o dotenv roda uma vez só. Sem tirar o snapshot depois dele, o
 *  `afterEach` apaga DB_HOST e companhia e só o primeiro caso passa. */
const original = { ...process.env };

const send = vi.fn();

vi.mock('resend', () => ({
  Resend: class {
    emails = { send };
  },
}));

const loadProvider = async (overrides: Record<string, string | undefined>) => {
  process.env = { ...original, ...overrides } as NodeJS.ProcessEnv;
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
  }

  vi.resetModules();
  const { ResendEmail } =
    await import('../../../src/modules/messaging/providers/resend-email.provider.js');

  return new ResendEmail();
};

const production = {
  NODE_ENV: 'production',
  RESEND_API_KEY: 're_teste',
  EMAIL_FROM: 'Coleta <nao-responda@contabilidade.com.br>',
  R2_ACCOUNT_ID: 'conta',
  R2_ACCESS_KEY_ID: 'chave',
  R2_SECRET_ACCESS_KEY: 'segredo',
  R2_BUCKET: 'documentos',
};

const message = {
  recipient: 'maria@empresa.com.br',
  subject: 'Documentos de 08/2026 — Padaria',
  body: '<p>Envie pelo link</p>',
};

afterEach(() => {
  process.env = { ...original };
  send.mockReset();
  vi.resetModules();
});

test('entrega ao destinatário real com o EMAIL_FROM próprio', async () => {
  send.mockResolvedValue({ error: null });

  const provider = await loadProvider(production);
  await provider.send(message);

  const [payload] = send.mock.calls[0];
  expect(payload.to).toBe('maria@empresa.com.br');
  expect(payload.from).toBe('Coleta <nao-responda@contabilidade.com.br>');
  expect(payload.subject).toBe('Documentos de 08/2026 — Padaria');
  expect(payload.html).toContain('Envie pelo link');
});

test('nome da Contabilidade vira o remetente de exibição, no endereço verificado', async () => {
  send.mockResolvedValue({ error: null });

  const provider = await loadProvider(production);
  await provider.send({ ...message, senderName: 'Contabilidade Silva' });

  const [payload] = send.mock.calls[0];
  expect(payload.from).toBe(
    'Contabilidade Silva via Coleta de Documentos <nao-responda@contabilidade.com.br>',
  );
});

test('erro da Resend vira exceção (senão o envio falho seria gravado como enviado)', async () => {
  send.mockResolvedValue({
    error: { name: 'validation_error', message: 'You can only send testing emails' },
  });

  const provider = await loadProvider(production);

  await expect(provider.send(message)).rejects.toThrow(
    /validation_error: You can only send testing emails/,
  );
});
