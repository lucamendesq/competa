import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { message } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';
import { spyProvider, waitFor } from './provider-spy.js';

/** `GET /messages` é o log de envios do Contador, e `failuresByPeriod` (dentro do Painel
 *  de Pendências) é o contrato que mostra o que NÃO saiu. Os dois só alcançam `message`
 *  pelo join até a Competência da Contabilidade da sessão. */

let app: INestApplication;
let provider: ReturnType<typeof spyProvider>;

beforeAll(async () => {
  app = await createTestApp();
  provider = spyProvider(app);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  provider.reset();
});

const waitForMessages = (count: number) =>
  waitFor(async () => {
    const rows = await db.select().from(message);
    return rows.length === count && rows.every((row) => row.status !== 'queued') ? rows : undefined;
  }, `esperava ${count} linha(s) em message`);

/** Contabilidade com duas Empresas: a Competência de julho falha no canal, a de agosto sai. */
const scenario = async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Zé Materiais' });

  provider.breakChannel('provedor de email fora do ar');
  const falhou = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  await waitForMessages(2);

  provider.healChannel();
  const saiu = await openPeriod(app, session.cookie, { referenceMonth: '2026-08' });
  await waitForMessages(4);

  return { session, falhou, saiu };
};

const list = async (cookie: string, query: Record<string, string | number> = {}) => {
  const response = await http(app)
    .get('/messages')
    .set('cookie', cookie)
    .query(query)
    .expect(200);

  return response.body as {
    data: { id: string; requestId: string; periodId: string; status: string; companyName: string }[];
    meta: { page: number; perPage: number; total: number };
  };
};

test('paginação: meta.total conta tudo, a página traz só o pedido', async () => {
  const { session } = await scenario();

  const primeira = await list(session.cookie, { page: 1, perPage: 1 });
  expect(primeira.data).toHaveLength(1);
  expect(primeira.meta).toEqual({ page: 1, perPage: 1, total: 4 });

  const segunda = await list(session.cookie, { page: 2, perPage: 1 });
  expect(segunda.data).toHaveLength(1);
  expect(segunda.data[0].id).not.toBe(primeira.data[0].id);
  expect(segunda.meta.total).toBe(4);

  const quinta = await list(session.cookie, { page: 5, perPage: 1 });
  expect(quinta.data).toHaveLength(0);
  expect(quinta.meta.total).toBe(4);
});

test('filtro por status separa o que saiu do que falhou', async () => {
  const { session } = await scenario();

  const falhas = await list(session.cookie, { status: 'failed' });
  expect(falhas.meta.total).toBe(2);
  expect(falhas.data.every((row) => row.status === 'failed')).toBe(true);

  const enviadas = await list(session.cookie, { status: 'sent' });
  expect(enviadas.meta.total).toBe(2);
  expect(enviadas.data.every((row) => row.status === 'sent')).toBe(true);

  expect(await list(session.cookie, { status: 'delivered' })).toMatchObject({
    data: [],
    meta: { total: 0 },
  });
});

test('filtro por requestId e por periodId', async () => {
  const { session, falhou, saiu } = await scenario();
  const request = falhou.requests[0];

  const porRequest = await list(session.cookie, { requestId: request.id });
  expect(porRequest.meta.total).toBe(1);
  expect(porRequest.data[0].requestId).toBe(request.id);
  expect(porRequest.data[0].companyName).toBe(request.companyName);

  const porPeriod = await list(session.cookie, { periodId: saiu.id });
  expect(porPeriod.meta.total).toBe(2);
  expect(porPeriod.data.every((row) => row.periodId === saiu.id)).toBe(true);

  const combinado = await list(session.cookie, { periodId: saiu.id, status: 'failed' });
  expect(combinado.meta.total).toBe(0);
});

test('filtro que não é uuid é recusado com 422 — não vira listagem inteira', async () => {
  const { session } = await scenario();

  const response = await http(app)
    .get('/messages')
    .set('cookie', session.cookie)
    .query({ requestId: 'nao-e-uuid' })
    .expect(422);

  expect(response.body.error.code).toBe('VALIDATION_ERROR');
  expect(response.body.error.details.fieldErrors).toHaveProperty('requestId');
});

test('escopo por tenant: outra Contabilidade vê total 0 mesmo passando os ids da primeira', async () => {
  const { falhou, saiu } = await scenario();
  const outra = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  expect(await list(outra.cookie)).toMatchObject({ data: [], meta: { total: 0 } });
  expect(await list(outra.cookie, { requestId: falhou.requests[0].id })).toMatchObject({
    data: [],
    meta: { total: 0 },
  });
  expect(await list(outra.cookie, { periodId: saiu.id })).toMatchObject({
    data: [],
    meta: { total: 0 },
  });
});

test('sem sessão não se lê o log de envios', async () => {
  await scenario();

  await http(app).get('/messages').expect(401);
});

test('failuresByPeriod devolve só as falhas daquela Competência', async () => {
  const { session, falhou, saiu } = await scenario();

  const painelFalhou = await http(app)
    .get(`/periods/${falhou.id}/pending-panel`)
    .set('cookie', session.cookie)
    .expect(200);

  type Failure = { purpose: string; error: string; requestId: string };
  const falhas: Failure[] = painelFalhou.body.data.flatMap(
    (row: { channelFailures: Failure[] }) => row.channelFailures,
  );
  expect(falhas).toHaveLength(2);
  expect(falhas.every((row) => row.purpose === 'link_delivery')).toBe(true);
  expect(falhas.every((row) => row.error.includes('provedor de email fora do ar'))).toBe(true);
  expect(falhas.map((row) => row.requestId).sort()).toEqual(
    falhou.requests.map((row) => row.id).sort(),
  );

  const painelSaiu = await http(app)
    .get(`/periods/${saiu.id}/pending-panel`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(
    painelSaiu.body.data.flatMap((row: { channelFailures: [] }) => row.channelFailures),
  ).toHaveLength(0);
});

test('failuresByPeriod não atravessa tenant: a Competência da outra Contabilidade é 404', async () => {
  const { falhou } = await scenario();
  const outra = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  const response = await http(app)
    .get(`/periods/${falhou.id}/pending-panel`)
    .set('cookie', outra.cookie)
    .expect(404);

  expect(response.body.error.code).toBe('NOT_FOUND');
  // e nada de `message` da outra Contabilidade vazou por outro caminho
  expect(await db.select().from(message).where(eq(message.status, 'failed'))).toHaveLength(2);
});
