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
  const failed = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  await waitForMessages(2);

  provider.healChannel();
  const left = await openPeriod(app, session.cookie, { referenceMonth: '2026-08' });
  await waitForMessages(4);

  return { session, failed, left };
};

const list = async (cookie: string, query: Record<string, string | number> = {}) => {
  const response = await http(app).get('/messages').set('cookie', cookie).query(query).expect(200);

  return response.body as {
    data: {
      id: string;
      requestId: string;
      periodId: string;
      status: string;
      companyName: string;
    }[];
    meta: { page: number; perPage: number; total: number };
  };
};

test('paginação: meta.total conta tudo, a página traz só o pedido', async () => {
  const { session } = await scenario();

  const first = await list(session.cookie, { page: 1, perPage: 1 });
  expect(first.data).toHaveLength(1);
  expect(first.meta).toEqual({ page: 1, perPage: 1, total: 4 });

  const second = await list(session.cookie, { page: 2, perPage: 1 });
  expect(second.data).toHaveLength(1);
  expect(second.data[0].id).not.toBe(first.data[0].id);
  expect(second.meta.total).toBe(4);

  const quinta = await list(session.cookie, { page: 5, perPage: 1 });
  expect(quinta.data).toHaveLength(0);
  expect(quinta.meta.total).toBe(4);
});

test('filtro por status separa o que saiu do que falhou', async () => {
  const { session } = await scenario();

  const failures = await list(session.cookie, { status: 'failed' });
  expect(failures.meta.total).toBe(2);
  expect(failures.data.every((row) => row.status === 'failed')).toBe(true);

  const sent = await list(session.cookie, { status: 'sent' });
  expect(sent.meta.total).toBe(2);
  expect(sent.data.every((row) => row.status === 'sent')).toBe(true);

  expect(await list(session.cookie, { status: 'delivered' })).toMatchObject({
    data: [],
    meta: { total: 0 },
  });
});

test('filtro por requestId e por periodId', async () => {
  const { session, failed, left } = await scenario();
  const request = failed.requests[0];

  const porRequest = await list(session.cookie, { requestId: request.id });
  expect(porRequest.meta.total).toBe(1);
  expect(porRequest.data[0].requestId).toBe(request.id);
  expect(porRequest.data[0].companyName).toBe(request.companyName);

  const porPeriod = await list(session.cookie, { periodId: left.id });
  expect(porPeriod.meta.total).toBe(2);
  expect(porPeriod.data.every((row) => row.periodId === left.id)).toBe(true);

  const merged = await list(session.cookie, { periodId: left.id, status: 'failed' });
  expect(merged.meta.total).toBe(0);
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
  const { failed, left } = await scenario();
  const other = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  expect(await list(other.cookie)).toMatchObject({ data: [], meta: { total: 0 } });
  expect(await list(other.cookie, { requestId: failed.requests[0].id })).toMatchObject({
    data: [],
    meta: { total: 0 },
  });
  expect(await list(other.cookie, { periodId: left.id })).toMatchObject({
    data: [],
    meta: { total: 0 },
  });
});

test('sem sessão não se lê o log de envios', async () => {
  await scenario();

  await http(app).get('/messages').expect(401);
});

test('failuresByPeriod devolve só as falhas daquela Competência', async () => {
  const { session, failed, left } = await scenario();

  const panelFailed = await http(app)
    .get(`/periods/${failed.id}/pending-panel`)
    .set('cookie', session.cookie)
    .expect(200);

  type Failure = { purpose: string; error: string; requestId: string };
  const failures: Failure[] = panelFailed.body.data.flatMap(
    (row: { channelFailures: Failure[] }) => row.channelFailures,
  );
  expect(failures).toHaveLength(2);
  expect(failures.every((row) => row.purpose === 'link_delivery')).toBe(true);
  expect(failures.every((row) => row.error.includes('provedor de email fora do ar'))).toBe(true);
  expect(failures.map((row) => row.requestId).sort()).toEqual(
    failed.requests.map((row) => row.id).sort(),
  );

  const panelReturned = await http(app)
    .get(`/periods/${left.id}/pending-panel`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(
    panelReturned.body.data.flatMap((row: { channelFailures: [] }) => row.channelFailures),
  ).toHaveLength(0);
});

test('failuresByPeriod não atravessa tenant: a Competência da outra Contabilidade é 404', async () => {
  const { failed } = await scenario();
  const other = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  const response = await http(app)
    .get(`/periods/${failed.id}/pending-panel`)
    .set('cookie', other.cookie)
    .expect(404);

  expect(response.body.error.code).toBe('NOT_FOUND');
  // e nada de `message` da outra Contabilidade vazou por outro caminho
  expect(await db.select().from(message).where(eq(message.status, 'failed'))).toHaveLength(2);
});
