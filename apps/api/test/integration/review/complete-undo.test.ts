import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, request, requestItem } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, openPeriod } from '../../factories.js';
import {
  acceptEveryItem,
  drainDeliveries,
  resetRateLimit,
  emptyChecklistCompany,
  itemNamed,
  messagesOf,
  rejectDocument,
  setupReview,
  uploadOk,
  waitForMessages,
} from './helpers.js';

/** `open → complete` é automático e reversível; `closed` é palavra final. Desfazer o
 *  aceite é correção interna do Contador: volta o estado e NÃO manda email. */

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

test('aceitar o último Item faz a Solicitação virar complete sozinha', async () => {
  const { cookie, requestId, token } = await setupReview(app);

  const { last } = await acceptEveryItem(app, cookie, requestId, token);

  expect(last.requestStatus).toBe('complete');
  expect(last.completed).toBe(true);

  const [row] = await db.select().from(request).where(eq(request.id, requestId));
  expect(row.status).toBe('complete');

  const avisos = await waitForMessages(requestId, 'completion');
  expect(avisos).toHaveLength(1);
});

test('rejeitar um Documento depois do complete volta a Solicitação para open com o Item pending', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const { items } = await acceptEveryItem(app, cookie, requestId, token);
  const alvo = items[0];

  // o Responsável ainda pode mandar mais um arquivo para um Item já aceito: ele nasce
  // `pending` e é ele que o Contador rejeita para reabrir o Item
  const documentId = await uploadOk(app, token, {
    fileName: 'versao-errada.pdf',
    requestItemId: alvo.id,
  });

  const { response } = await rejectDocument(app, cookie, documentId, 'Arquivo corrompido');

  expect(response.status).toBe(201);
  expect(response.body.data.requestStatus).toBe('open');

  const [row] = await db.select().from(request).where(eq(request.id, requestId));
  expect(row.status).toBe('open');

  const [item] = await db.select().from(requestItem).where(eq(requestItem.id, alvo.id));
  expect(item.status).toBe('pending');
});

test('Solicitação sem nenhum Item não vira complete', async () => {
  const session = await createAccountantSession(app);
  await emptyChecklistCompany(app, session.cookie, 'Empresa Sem Checklist');
  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(period.requests[0].itemCount).toBe(0);

  const [row] = await db.select().from(request).where(eq(request.id, period.requests[0].id));
  expect(row.status).toBe('open');
});

test('Solicitação encerrada nunca volta para open nem para complete', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const { items } = await acceptEveryItem(app, cookie, requestId, token);

  // um documento ainda `pending` (o caminho que reabriria o Item) antes de encerrar
  const documentId = await uploadOk(app, token, {
    fileName: 'atrasado.pdf',
    requestItemId: items[0].id,
  });
  await http(app).post(`/requests/${requestId}/close`).set('cookie', cookie).expect(201);

  const rejeicao = await rejectDocument(app, cookie, documentId, 'Tarde demais');
  expect(rejeicao.response.status).toBe(409);
  expect(rejeicao.response.body.error.message).toMatch(/encerrada/i);

  await http(app).post(`/request-items/${items[0].id}/accept`).set('cookie', cookie).expect(409);
  await http(app)
    .post(`/request-items/${items[0].id}/undo-accept`)
    .set('cookie', cookie)
    .expect(409);

  const [row] = await db.select().from(request).where(eq(request.id, requestId));
  expect(row.status).toBe('closed');
});

test('desfazer aceite devolve o Item para submitted, os Documentos para pending e derruba o complete', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const { items } = await acceptEveryItem(app, cookie, requestId, token);
  const alvo = items[0];

  const antes = await messagesOf(requestId);

  const response = await http(app)
    .post(`/request-items/${alvo.id}/undo-accept`)
    .set('cookie', cookie)
    .expect(201);

  expect(response.body.data).toMatchObject({
    itemStatus: 'submitted',
    revertedDocuments: 1,
    requestStatus: 'open',
  });

  const [item] = await db.select().from(requestItem).where(eq(requestItem.id, alvo.id));
  expect(item.status).toBe('submitted');

  const documentos = await db.select().from(document).where(eq(document.requestItemId, alvo.id));
  expect(documentos.map((row) => row.reviewStatus)).toEqual(['pending']);

  const [row] = await db.select().from(request).where(eq(request.id, requestId));
  expect(row.status).toBe('open');

  // desfazer é correção interna: nada sai por email
  await new Promise((resolve) => setTimeout(resolve, 200));
  const depois = await messagesOf(requestId);
  expect(depois).toHaveLength(antes.length);
});

test('desfazer aceite de Item que não está aceito responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  const response = await http(app)
    .post(`/request-items/${item.id}/undo-accept`)
    .set('cookie', cookie)
    .expect(409);

  expect(response.body.error.message).toMatch(/não está aceito/i);

  const [saved] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(saved.status).toBe('submitted');
});

test('desfazer aceite em Solicitação encerrada responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });
  await http(app).post(`/request-items/${item.id}/accept`).set('cookie', cookie).expect(201);
  await http(app).post(`/requests/${requestId}/close`).set('cookie', cookie).expect(201);

  const response = await http(app)
    .post(`/request-items/${item.id}/undo-accept`)
    .set('cookie', cookie)
    .expect(409);

  expect(response.body.error.message).toMatch(/encerrada/i);

  const [saved] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(saved.status).toBe('accepted');
});
