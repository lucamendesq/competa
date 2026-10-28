import { createDecipheriv } from 'node:crypto';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import env from '../src/config/env.js';
import { bootApp, type RunningApp } from './support/boot.js';
import { db, truncateAll } from './support/db.js';
import { message, whatsappIntegration } from '../src/infra/database/schema/index.js';
import { apiClient, registerFirm, uniqueIp, type Api } from './support/fixtures.js';

/* Ambiente de teste SEM segredos Meta (META_APP_ID, META_APP_SECRET, WHATSAPP_VERIFY_TOKEN
 * fixados vazios no vitest.config): os webhooks falham fechados (503). A
 * WHATSAPP_ENCRYPTION_KEY, essa SIM existe — o serviço perdeu o fallback de zeros e sem ela
 * o app não sobe. Provider em teste: MockWhatsappProvider. */

const MOCK_ONBOARD_RESULT = {
  status: 'active',
  displayPhoneNumber: '5511999999999',
  wabaId: 'mock_waba_id',
};
const MEMBER_PASSWORD = 'senha-de-membro-123';

let app: RunningApp;

beforeAll(async () => {
  await truncateAll();
  app = await bootApp();
});

afterAll(async () => {
  await app.close();
});

/** Decifra com a MESMA chave que o app usa (vitest.config). Formato: `iv:authTag:cifrado`. */
const decryptStored = (stored: string) => {
  const [ivHex, authTagHex, encrypted] = stored.split(':');
  const key = process.env.WHATSAPP_ENCRYPTION_KEY!;
  const decipher = createDecipheriv(
    'aes-256-gcm',
    Buffer.from(key, key.length === 64 ? 'hex' : 'utf-8').subarray(0, 32),
    Buffer.from(ivHex, 'hex'),
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
};

const integrationRows = (firmId: string) =>
  db.select().from(whatsappIntegration).where(eq(whatsappIntegration.accountingFirmId, firmId));

async function firmIdOf(api: Api): Promise<string> {
  const res = await api.get('/auth/me');
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.data.accountingFirm.id;
}

const cookieOf = (headers: Headers) =>
  headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');

let memberSeq = 0;

async function registerMember(ownerApi: Api) {
  const email = `membro-${Date.now().toString(36)}-${++memberSeq}@example.com`;

  const invited = await ownerApi.post('/invites', { email });
  expect(invited.status, JSON.stringify(invited.body)).toBe(201);
  const inviteToken = invited.body.data.url.split('/convite/')[1];

  const signedUp = await apiClient(app.url).post('/auth/sign-up', {
    token: inviteToken,
    name: 'Membro',
    email,
    password: MEMBER_PASSWORD,
  });
  expect(signedUp.status, JSON.stringify(signedUp.body)).toBe(201);

  const ip = uniqueIp();
  const signedIn = await fetch(`${app.url}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { 'x-forwarded-for': ip, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: MEMBER_PASSWORD }),
  });
  expect(signedIn.status, await signedIn.clone().text()).toBe(200);
  const cookie = cookieOf(signedIn.headers);
  expect(cookie).not.toBe('');

  return apiClient(app.url, { cookie, ip });
}

describe('autorização', () => {
  it('rotas de configuração exigem sessão (401 UNAUTHENTICATED)', async () => {
    const anon = apiClient(app.url);

    for (const res of await Promise.all([
      anon.get('/whatsapp/status'),
      anon.post('/whatsapp/onboard', { code: 'abc' }),
      anon.post('/whatsapp/test', { phone: '11999998888' }),
      anon.delete('/whatsapp'),
    ])) {
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });
});

describe('webhook público — segredos Meta ausentes falham fechados', () => {
  it('GET /whatsapp/webhook é público mas recusa 503 sem WHATSAPP_VERIFY_TOKEN', async () => {
    const meta = apiClient(app.url);

    /* A recusa vem ANTES de olhar os parâmetros hub.*: o desafio de verificação da Meta
     * (echo do hub.challenge) é branch morto neste ambiente. */
    for (const res of await Promise.all([
      meta.get(
        '/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=qualquer&hub.challenge=123456',
      ),
      meta.get('/whatsapp/webhook'),
    ])) {
      expect(res.status).toBe(503);
      expect(res.body.error).toEqual({
        code: 'SERVICE_UNAVAILABLE',
        message: 'Webhook não configurado.',
      });
    }
  });

  it('GET /whatsapp/webhook com token certo ecoa o hub.challenge em texto puro', async () => {
    env.WHATSAPP_VERIFY_TOKEN = 'verificacao-meta';
    try {
      const res = await fetch(
        `${app.url}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verificacao-meta&hub.challenge=1158201444`,
        { headers: { 'x-forwarded-for': uniqueIp() } },
      );
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/plain');
      expect(await res.text()).toBe('1158201444');

      const wrong = await fetch(
        `${app.url}/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=outro&hub.challenge=1`,
        { headers: { 'x-forwarded-for': uniqueIp() } },
      );
      expect(wrong.status).toBe(403);
    } finally {
      env.WHATSAPP_VERIFY_TOKEN = undefined;
    }
  });

  it('POST /whatsapp/webhook recusa 503 sem META_APP_SECRET, mesmo com assinatura', async () => {
    const meta = apiClient(app.url);
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          changes: [{ value: { statuses: [{ id: 'wamid.fake', status: 'delivered' as const }] } }],
        },
      ],
    };

    const signed = await fetch(`${app.url}/whatsapp/webhook`, {
      method: 'POST',
      headers: {
        'x-forwarded-for': uniqueIp(),
        'content-type': 'application/json',
        'x-hub-signature-256': `sha256=${'0'.repeat(64)}`,
      },
      body: JSON.stringify(payload),
    });
    expect(signed.status).toBe(503);
    const signedBody = await signed.json();
    expect(signedBody.error).toEqual({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Webhook não configurado.',
    });

    const unsigned = await meta.post('/whatsapp/webhook', payload);
    expect(unsigned.status).toBe(503);
    expect(unsigned.body.error.code).toBe('SERVICE_UNAVAILABLE');

    /* Branch morto confirmado: nenhum status de entrega é processado. */
    const touched = await db
      .select({ id: message.id })
      .from(message)
      .where(eq(message.metaMessageId, 'wamid.fake'));
    expect(touched).toEqual([]);
  });
});

describe('ciclo de vida da integração (status → onboard → disconnect)', () => {
  let api: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
    firmId = await firmIdOf(api);
  });

  it('GET /whatsapp/status sem integração → not_connected', async () => {
    const res = await api.get('/whatsapp/status');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'not_connected' } });
  });

  it('POST /whatsapp/onboard ignora o code e grava credenciais mock (stub sem META_APP_ID)', async () => {
    const res = await api.post('/whatsapp/onboard', { code: 'codigo-que-nao-vai-para-a-meta' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ data: MOCK_ONBOARD_RESULT });
  });

  it('a linha de whatsapp_integration nasce active com os valores mock e token cifrado', async () => {
    const rows = await integrationRows(firmId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'active',
      wabaId: 'mock_waba_id',
      phoneNumberId: 'mock_phone_number_id',
      displayPhoneNumber: '5511999999999',
      businessAccountId: null,
      webhookStatus: 'inactive',
    });
    expect(rows[0].accessToken).not.toContain('mock_long_lived_token');
    expect(rows[0].accessToken).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it('round-trip do crypto com a WHATSAPP_ENCRYPTION_KEY do ambiente', async () => {
    const [row] = await integrationRows(firmId);
    expect(decryptStored(row.accessToken)).toBe('mock_long_lived_token');
  });

  it('GET /whatsapp/status reflete a integração ativa', async () => {
    const res = await api.get('/whatsapp/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(MOCK_ONBOARD_RESULT);
  });

  it('onboard de novo faz upsert: mesma linha, cifrado novo (IV aleatório)', async () => {
    const [before] = await integrationRows(firmId);
    const res = await api.post('/whatsapp/onboard', { code: 'outro-codigo' });
    expect(res.status).toBe(201);

    const rows = await integrationRows(firmId);
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(before.id);
    expect(rows[0].accessToken).not.toBe(before.accessToken);
  });

  it('DELETE /whatsapp apaga a linha e o status volta a not_connected', async () => {
    const res = await api.delete('/whatsapp');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { success: true } });

    expect(await integrationRows(firmId)).toEqual([]);
    const status = await api.get('/whatsapp/status');
    expect(status.body.data).toEqual({ status: 'not_connected' });
  });

  it('DELETE sem integração é idempotente: 200 success', async () => {
    const res = await api.delete('/whatsapp');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { success: true } });
  });
});

describe('POST /whatsapp/test', () => {
  let api: Api;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  /* Falta de integração é conflito de ESTADO — o Contador precisa conectar antes —, não
   * falha do servidor. Vinha como `Error` cru, que o mapa de erros só sabia tratar como 500
   * e ainda expunha a mensagem interna em `details`. */
  it('sem integração ativa → 409 WHATSAPP_NOT_CONNECTED', async () => {
    const res = await api.post('/whatsapp/test', { phone: '11999998888' });
    expect(res.status, JSON.stringify(res.body)).toBe(409);
    expect(res.body.error.code).toBe('WHATSAPP_NOT_CONNECTED');
    expect(res.body.error.message).toContain('Conecte o WhatsApp');
    expect(res.body.error.details, 'erro tipado não vaza interno').toBeUndefined();
  });

  it('com integração ativa o mock envia e responde success', async () => {
    const onboarded = await api.post('/whatsapp/onboard', { code: 'abc' });
    expect(onboarded.status).toBe(201);

    const res = await api.post('/whatsapp/test', { phone: '11999998888' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ data: { success: true } });
  });

  it('o envio de teste não deixa rastro: nenhuma linha em message (id mock descartado)', async () => {
    const byPurpose = await db
      .select({ id: message.id })
      .from(message)
      .where(eq(message.purpose, 'test'));
    const byMockId = await db
      .select({ id: message.id })
      .from(message)
      .where(like(message.metaMessageId, 'wamid.mock%'));

    expect(byPurpose).toEqual([]);
    expect(byMockId).toEqual([]);
  });
});

describe('validação (zodPipe → 422)', () => {
  let api: Api;

  beforeAll(async () => {
    ({ api } = await registerFirm(app.url));
  });

  it('onboard sem code ou com code vazio → 422 VALIDATION_ERROR com issues', async () => {
    for (const body of [{}, { code: '' }, { code: 42 }]) {
      const res = await api.post('/whatsapp/onboard', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details.length).toBeGreaterThan(0);
    }
  });

  it('test com phone ausente ou curto demais → 422 VALIDATION_ERROR', async () => {
    for (const body of [{}, { phone: '123' }]) {
      const res = await api.post('/whatsapp/test', body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    }
  });
});

describe('permissões de equipe (dono vs membro)', () => {
  let ownerApi: Api;
  let memberApi: Api;
  let firmId: string;

  beforeAll(async () => {
    ({ api: ownerApi } = await registerFirm(app.url));
    firmId = await firmIdOf(ownerApi);
    memberApi = await registerMember(ownerApi);
  });

  it('membro não conecta nem desconecta: 403 ONLY_OWNER_CAN_MANAGE_TEAM', async () => {
    for (const res of await Promise.all([
      memberApi.post('/whatsapp/onboard', { code: 'abc' }),
      memberApi.delete('/whatsapp'),
    ])) {
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ONLY_OWNER_CAN_MANAGE_TEAM');
    }

    expect(await integrationRows(firmId)).toEqual([]);
  });

  it('membro lê o status normalmente', async () => {
    const res = await memberApi.get('/whatsapp/status');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ status: 'not_connected' });
  });

  it('envio de teste NÃO é restrito ao dono (quirk congelado)', async () => {
    const onboarded = await ownerApi.post('/whatsapp/onboard', { code: 'abc' });
    expect(onboarded.status).toBe(201);

    const res = await memberApi.post('/whatsapp/test', { phone: '11999998888' });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body).toEqual({ data: { success: true } });
  });
});

describe('isolamento entre firmas', () => {
  it('integração é por firma: onboard/disconnect de uma não toca a outra', async () => {
    const [a, b] = await Promise.all([registerFirm(app.url), registerFirm(app.url)]);
    const [firmA, firmB] = await Promise.all([firmIdOf(a.api), firmIdOf(b.api)]);

    const onboardedA = await a.api.post('/whatsapp/onboard', { code: 'abc' });
    expect(onboardedA.status).toBe(201);

    const statusB = await b.api.get('/whatsapp/status');
    expect(statusB.body.data).toEqual({ status: 'not_connected' });

    const onboardedB = await b.api.post('/whatsapp/onboard', { code: 'abc' });
    expect(onboardedB.status).toBe(201);

    const disconnectedA = await a.api.delete('/whatsapp');
    expect(disconnectedA.status).toBe(200);

    expect(await integrationRows(firmA)).toEqual([]);
    const rowsB = await integrationRows(firmB);
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].status).toBe('active');
  });
});
