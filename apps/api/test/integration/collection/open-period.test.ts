import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  period,
  request,
  requestItem,
  uploadLink,
} from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  insertCompany,
  openPeriod,
} from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** Abrir a Competência: normalização do mês, unicidade por Contabilidade e escopo. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3971);
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

const counts = async () => ({
  periods: (await db.select().from(period)).length,
  requests: (await db.select().from(request)).length,
  items: (await db.select().from(requestItem)).length,
  links: (await db.select().from(uploadLink)).length,
});

test('YYYY-MM é normalizado para o dia 1 da competência', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });

  const response = await http(app)
    .post('/periods')
    .set('cookie', session.cookie)
    .send({ referenceMonth: '2026-07' })
    .expect(201);

  expect(response.body.data.referenceMonth).toBe('2026-07-01');

  const [row] = await db.select().from(period);
  expect(row.referenceMonth).toBe('2026-07-01');
});

test('YYYY-MM-DD no meio do mês também é normalizado para o dia 1', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .post('/periods')
    .set('cookie', session.cookie)
    .send({ referenceMonth: '2026-07-19' })
    .expect(201);

  expect(response.body.data.referenceMonth).toBe('2026-07-01');
});

test('mês inválido é recusado com 422 e não cria Competência', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .post('/periods')
    .set('cookie', session.cookie)
    .send({ referenceMonth: '2026-13' })
    .expect(422);

  expect(response.body.error.code).toBe('VALIDATION_ERROR');
  expect(await db.select().from(period)).toHaveLength(0);
});

test('abrir a mesma competência duas vezes responde 409 PERIOD_ALREADY_OPEN', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  const response = await http(app)
    .post('/periods')
    .set('cookie', session.cookie)
    .send({ referenceMonth: '2026-07' })
    .expect(409);

  expect(response.body.error.code).toBe('PERIOD_ALREADY_OPEN');
});

test('a segunda abertura não deixa nada órfão no banco', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Mercado do Bairro' });
  await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  const before = await counts();
  expect(before.requests).toBe(2);

  await http(app)
    .post('/periods')
    .set('cookie', session.cookie)
    .send({ referenceMonth: '2026-07-15' })
    .expect(409);

  expect(await counts()).toEqual(before);
});

test('Contabilidade sem Empresa ativa abre a Competência com 0 Solicitações', async () => {
  const session = await createAccountantSession(app);
  const inactive = await insertCompany(session.firm.id, { name: 'Inativa', active: false });
  expect(inactive.active).toBe(false);

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(opened.requests).toEqual([]);
  expect(opened.warnings).toEqual([]);
  expect(await db.select().from(request)).toHaveLength(0);
});

test('duas Contabilidades abrem o MESMO mês de referência sem colidir', async () => {
  const first = await createAccountantSession(app, { firmName: 'Contabilidade A' });
  const second = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  await openPeriod(app, first.cookie, { referenceMonth: '2026-07' });
  await openPeriod(app, second.cookie, { referenceMonth: '2026-07' });

  const rows = await db.select().from(period);
  expect(rows).toHaveLength(2);
  expect(new Set(rows.map((row) => row.accountingFirmId))).toEqual(
    new Set([first.firm.id, second.firm.id]),
  );
});

test('GET /periods só lista as Competências da própria Contabilidade', async () => {
  const mine = await createAccountantSession(app);
  const other = await createAccountantSession(app);
  await openPeriod(app, mine.cookie, { referenceMonth: '2026-07' });
  await openPeriod(app, other.cookie, { referenceMonth: '2026-08' });

  const response = await http(app).get('/periods').set('cookie', mine.cookie).expect(200);

  expect(response.body.data.map((row: { referenceMonth: string }) => row.referenceMonth)).toEqual([
    '2026-07-01',
  ]);
});

test('Competência de outra Contabilidade não existe para a leitura: 404, nunca 403', async () => {
  const mine = await createAccountantSession(app);
  const other = await createAccountantSession(app);
  const foreign = await openPeriod(app, other.cookie, { referenceMonth: '2026-07' });

  for (const path of [
    `/periods/${foreign.id}`,
    `/periods/${foreign.id}/requests`,
    `/periods/${foreign.id}/pending-panel`,
  ]) {
    const response = await http(app).get(path).set('cookie', mine.cookie).expect(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  }
});

test('encerrar Competência de outra Contabilidade responde 404 e não a encerra', async () => {
  const mine = await createAccountantSession(app);
  const other = await createAccountantSession(app);
  const foreign = await openPeriod(app, other.cookie, { referenceMonth: '2026-07' });

  await http(app).post(`/periods/${foreign.id}/close`).set('cookie', mine.cookie).expect(404);

  const [row] = await db.select().from(period).where(eq(period.id, foreign.id));
  expect(row.status).toBe('open');
});

test('Solicitação de outra Contabilidade responde 404 na leitura e no encerramento', async () => {
  const mine = await createAccountantSession(app);
  const other = await createAccountantSession(app);
  await createCompany(app, other.cookie, { name: 'Padaria Central' });
  const foreign = await openPeriod(app, other.cookie, { referenceMonth: '2026-07' });
  const requestId = foreign.requests[0].id;

  await http(app).get(`/requests/${requestId}`).set('cookie', mine.cookie).expect(404);
  await http(app).post(`/requests/${requestId}/close`).set('cookie', mine.cookie).expect(404);

  const [row] = await db.select().from(request).where(eq(request.id, requestId));
  expect(row.status).toBe('open');
});
