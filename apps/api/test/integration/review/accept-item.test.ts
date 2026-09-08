import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, requestItem } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  drainDeliveries,
  resetRateLimit,
  itemNamed,
  presignOnly,
  rejectDocument,
  requestPanel,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Revisão em lote: aceitar o Item é um ato só, e ele vale para todos os Documentos
 *  enviados daquele Item. O que já foi rejeitado é histórico e não volta atrás. */

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

test('aceitar o Item aceita TODOS os seus Documentos enviados numa tacada', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Notas fiscais emitidas');

  const first = await uploadOk(app, token, { fileName: 'nf-1.pdf', requestItemId: item.id });
  const second = await uploadOk(app, token, { fileName: 'nf-2.pdf', requestItemId: item.id });
  const third = await uploadOk(app, token, { fileName: 'nf-3.pdf', requestItemId: item.id });

  const response = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(201);

  expect(response.body.data.acceptedDocuments).toBe(3);

  const rows = await db.select().from(document);
  expect(rows.map((row) => row.reviewStatus)).toEqual(['accepted', 'accepted', 'accepted']);
  expect(new Set(rows.map((row) => row.id))).toEqual(new Set([first, second, third]));

  const [saved] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(saved.status).toBe('accepted');
});

test('Documento já rejeitado permanece rejeitado e NÃO é aceito junto com o Item', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');

  const refused = await uploadOk(app, token, { fileName: 'errado.pdf', requestItemId: item.id });
  const rejection = await rejectDocument(app, cookie, refused, 'Extrato do mês errado');
  expect(rejection.response.status).toBe(201);

  // token rotacionado na rejeição: o reenvio usa o link novo
  const correto = await uploadOk(app, rejection.token!, {
    fileName: 'certo.pdf',
    requestItemId: item.id,
  });

  const response = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(201);

  expect(response.body.data.acceptedDocuments).toBe(1);

  const [rejeitado] = await db.select().from(document).where(eq(document.id, refused));
  expect(rejeitado.reviewStatus).toBe('rejected');
  expect(rejeitado.rejectionReason).toBe('Extrato do mês errado');

  const [accepted] = await db.select().from(document).where(eq(document.id, correto));
  expect(accepted.reviewStatus).toBe('accepted');
});

test('aceitar Item pending (sem nenhum documento) responde 409 com o motivo', async () => {
  const { cookie, requestId } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Livro caixa');

  const response = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(409);

  expect(response.body.error.code).toBe('INVALID_TRANSITION');
  expect(response.body.error.message).toMatch(/ainda não tem documentos enviados/i);

  const [saved] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(saved.status).toBe('pending');
});

test('aceitar Item já aceito responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  await http(app).post(`/request-items/${item.id}/accept`).set('cookie', cookie).expect(201);

  const response = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(409);

  expect(response.body.error.message).toMatch(/já está aceito/i);
});

test('aceitar Item de Solicitação encerrada responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  await http(app).post(`/requests/${requestId}/close`).set('cookie', cookie).expect(201);

  const response = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(409);

  expect(response.body.error.message).toMatch(/encerrada/i);

  const [saved] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(saved.status).toBe('submitted');
});

test('Documento awaiting_upload não é aceito nem faz o Item ser revisável', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Livro caixa');

  const ghost = await presignOnly(app, token, {
    fileName: 'nunca-subiu.pdf',
    requestItemId: item.id,
  });

  const rejection = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(409);
  expect(rejection.body.error.message).toMatch(/ainda não tem documentos enviados/i);

  // agora com um documento de verdade: o fantasma continua fora do lote
  await uploadOk(app, token, { fileName: 'caixa.pdf', requestItemId: item.id });
  const accepted = await http(app)
    .post(`/request-items/${item.id}/accept`)
    .set('cookie', cookie)
    .expect(201);

  expect(accepted.body.data.acceptedDocuments).toBe(1);

  const [row] = await db.select().from(document).where(eq(document.id, ghost));
  expect(row.uploadStatus).toBe('awaiting_upload');
  expect(row.reviewStatus).toBe('pending');

  const panel = await requestPanel(app, cookie, requestId);
  const revisado = panel.items.find((row) => row.id === item.id)!;
  expect(revisado.documents).toHaveLength(1);
});
