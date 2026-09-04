import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, period, request } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';
import {
  acceptEveryItem,
  drainDeliveries,
  itemNamed,
  requestPanel,
  resetRateLimit,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Encerrar é ato exclusivo do Contador: vale mesmo com pendências (com aviso), é
 *  definitivo e, na Competência, arrasta as Solicitações. Depois disso o Item não recebe
 *  mais envio — só Documento Extra. */

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await drainDeliveries();
  await resetDatabase();
  resetRateLimit(app);
});

test('encerrar Solicitação com pendências devolve a contagem e o aviso', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });
  await http(app).post(`/request-items/${item.id}/accept`).set('cookie', cookie).expect(201);

  const response = await http(app)
    .post(`/requests/${requestId}/close`)
    .set('cookie', cookie)
    .expect(201);

  expect(response.body.data.status).toBe('closed');
  expect(response.body.data.pendingItemCount).toBe(4);
  expect(response.body.data.warning).toMatch(/4 item\(ns\) sem aceite/);
  expect(response.body.data.closedAt).not.toBeNull();
});

test('encerrar Solicitação já completa não gera aviso', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const { last } = await acceptEveryItem(app, cookie, requestId, token);
  expect(last.requestStatus).toBe('complete');

  const response = await http(app)
    .post(`/requests/${requestId}/close`)
    .set('cookie', cookie)
    .expect(201);

  expect(response.body.data.pendingItemCount).toBe(0);
  expect(response.body.data.warning).toBeNull();
  expect(response.body.data.status).toBe('closed');
});

test('encerrar a mesma Solicitação duas vezes responde 409', async () => {
  const { cookie, requestId } = await setupReview(app);

  await http(app).post(`/requests/${requestId}/close`).set('cookie', cookie).expect(201);

  const segunda = await http(app)
    .post(`/requests/${requestId}/close`)
    .set('cookie', cookie)
    .expect(409);

  expect(segunda.body.error.message).toMatch(/já foi encerrada/i);
});

test('encerrar a Competência encerra as Solicitações dela e devolve o total pendente', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Mercado Central' });
  const aberta = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  const response = await http(app)
    .post(`/periods/${aberta.id}/close`)
    .set('cookie', session.cookie)
    .expect(201);

  expect(response.body.data.status).toBe('closed');
  expect(response.body.data.closedRequestCount).toBe(2);
  // 5 itens por Empresa, nenhum aceito
  expect(response.body.data.pendingItemCount).toBe(10);
  expect(response.body.data.warning).toMatch(/10 item\(ns\) sem aceite/);

  const [row] = await db.select().from(period).where(eq(period.id, aberta.id));
  expect(row.status).toBe('closed');

  const requests = await db.select().from(request).where(eq(request.periodId, aberta.id));
  expect(requests.map((r) => r.status)).toEqual(['closed', 'closed']);
  expect(requests.every((r) => r.closedAt !== null)).toBe(true);
});

test('encerrar a mesma Competência duas vezes responde 409', async () => {
  const { cookie, period: aberta } = await setupReview(app);

  await http(app).post(`/periods/${aberta.id}/close`).set('cookie', cookie).expect(201);

  const segunda = await http(app)
    .post(`/periods/${aberta.id}/close`)
    .set('cookie', cookie)
    .expect(409);

  expect(segunda.body.error.code).toBe('PERIOD_ALREADY_CLOSED');
});

test('depois de encerrada, o Item não recebe mais envio (422) mas o Documento Extra é aceito', async () => {
  const { cookie, requestId, period: aberta, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');

  await http(app).post(`/periods/${aberta.id}/close`).set('cookie', cookie).expect(201);

  const recusa = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: item.id,
      files: [{ fileName: 'das.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
    })
    .expect(422);

  expect(recusa.body.error.message).toMatch(/Documento Extra/);

  const extra = await uploadOk(app, token, { fileName: 'depois-do-fecho.pdf' });
  const panel = await requestPanel(app, cookie, requestId);

  expect(panel.status).toBe('closed');
  expect(panel.extraDocuments.map((row) => row.id)).toEqual([extra]);

  const [row] = await db.select().from(document).where(eq(document.id, extra));
  expect(row.uploadStatus).toBe('uploaded');
  expect(row.requestItemId).toBeNull();
});

test('revisão em Solicitação encerrada pela Competência responde 409', async () => {
  const { cookie, requestId, period: aberta, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  await http(app).post(`/periods/${aberta.id}/close`).set('cookie', cookie).expect(201);

  const response = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(409);

  expect(response.body.error.message).toMatch(/encerrada/i);
});
