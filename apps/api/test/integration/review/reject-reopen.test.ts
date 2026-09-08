import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, requestItem, uploadLink } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  drainDeliveries,
  presignOnly,
  resetRateLimit,
  itemNamed,
  rejectDocument,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Rejeição é por Documento e reabre o Item. O Link é rotacionado no mesmo ato: o link
 *  antigo morre e o novo só existe no email (evento `ItemReopened`). */

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

const hashOf = async (requestId: string) => {
  const [row] = await db
    .select({ tokenHash: uploadLink.tokenHash })
    .from(uploadLink)
    .where(eq(uploadLink.requestId, requestId));

  return row.tokenHash;
};

test('rejeitar Documento grava o motivo, devolve o Item para pending e rotaciona o token do Link', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
  });

  const hashBefore = await hashOf(requestId);
  const { response, token: freshToken } = await rejectDocument(
    app,
    cookie,
    documentId,
    'Extrato ilegível',
  );

  expect(response.status).toBe(201);
  expect(response.body.data).toMatchObject({
    reviewStatus: 'rejected',
    itemStatus: 'pending',
    requestStatus: 'open',
    linkRotated: true,
  });

  const [row] = await db.select().from(document).where(eq(document.id, documentId));
  expect(row.reviewStatus).toBe('rejected');
  expect(row.rejectionReason).toBe('Extrato ilegível');

  const [saved] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(saved.status).toBe('pending');

  // hash novo no banco, token anterior morto, token novo vivo
  expect(await hashOf(requestId)).not.toBe(hashBefore);
  await http(app).get(`/upload/${token}`).expect(404);
  expect(freshToken).toBeTruthy();
  await http(app).get(`/upload/${freshToken}`).expect(200);
});

test('motivo com menos de 3 caracteres é recusado com 422 e não rejeita nada', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, { fileName: 'e.pdf', requestItemId: item.id });

  const response = await http(app)
    .post(`/documents/${documentId}/reject`)
    .set('cookie', cookie)
    .send({ rejectionReason: 'ok' })
    .expect(422);

  expect(response.body.error.code).toBe('VALIDATION_ERROR');

  const [row] = await db.select().from(document).where(eq(document.id, documentId));
  expect(row.reviewStatus).toBe('pending');
});

test('rejeitar o mesmo Documento duas vezes responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, { fileName: 'e.pdf', requestItemId: item.id });

  const first = await rejectDocument(app, cookie, documentId, 'Mês errado');
  expect(first.response.status).toBe(201);

  const second = await rejectDocument(app, cookie, documentId, 'Mês errado de novo');
  expect(second.response.status).toBe(409);
  expect(second.response.body.error.message).toMatch(/já foi rejeitado/i);
});

test('rejeitar Documento já aceito responde 409 — aceito não volta para rejeitado', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  const documentId = await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  await http(app).post(`/request-items/${item.id}/accept`).set('cookie', cookie).expect(201);

  const { response } = await rejectDocument(app, cookie, documentId, 'Mudei de ideia');
  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/já foi aceito/i);

  const [row] = await db.select().from(document).where(eq(document.id, documentId));
  expect(row.reviewStatus).toBe('accepted');
});

test('Documento Extra pela rota de Item responde 409 apontando review-extra', async () => {
  const { cookie, token } = await setupReview(app);
  const extra = await uploadOk(app, token, { fileName: 'contrato.pdf' });

  const { response } = await rejectDocument(app, cookie, extra, 'Não era isso');

  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/review-extra/);
});

test('rejeitar Documento de Solicitação encerrada responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  const documentId = await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  await http(app).post(`/requests/${requestId}/close`).set('cookie', cookie).expect(201);

  const { response } = await rejectDocument(app, cookie, documentId, 'Documento errado');

  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/encerrada/i);

  const [row] = await db.select().from(document).where(eq(document.id, documentId));
  expect(row.reviewStatus).toBe('pending');
});

test('Documento em awaiting_upload não é rejeitável: 409 e o Link não é rotacionado', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const ghost = await presignOnly(app, token, {
    fileName: 'nunca-subiu.pdf',
    requestItemId: item.id,
  });

  const hashBefore = await hashOf(requestId);
  const { response } = await rejectDocument(app, cookie, ghost, 'Não recebi nada');

  expect(response.status).toBe(409);
  expect(response.body.error.message).toMatch(/ainda não foi enviado/i);

  // o Responsável não pode perder o link por um envio que nunca chegou
  expect(await hashOf(requestId)).toBe(hashBefore);
  await http(app).get(`/upload/${token}`).expect(200);

  const [row] = await db.select().from(document).where(eq(document.id, ghost));
  expect(row.reviewStatus).toBe('pending');
});
