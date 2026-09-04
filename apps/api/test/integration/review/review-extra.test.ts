import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, request, requestItem } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  acceptEveryItem,
  drainDeliveries,
  resetRateLimit,
  itemNamed,
  itemsOf,
  presignOnly,
  requestPanel,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Documento Extra (`request_item_id IS NULL`) é revisado individualmente: não existe Item
 *  para revisar em lote, e ele não é exigência do checklist — logo não conta para
 *  `complete` nem mexe em `request_item`. */

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

test('review-extra aceita o Documento Extra', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const extra = await uploadOk(app, token, { fileName: 'contrato-social.pdf' });

  const response = await http(app)
    .post(`/documents/${extra}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'accepted' })
    .expect(201);

  expect(response.body.data).toMatchObject({ reviewStatus: 'accepted', rejectionReason: null });

  const panel = await requestPanel(app, cookie, requestId);
  expect(panel.extraDocuments).toHaveLength(1);
  expect(panel.extraDocuments[0].reviewStatus).toBe('accepted');
});

test('review-extra rejeita o Documento Extra com motivo', async () => {
  const { cookie, token } = await setupReview(app);
  const extra = await uploadOk(app, token, { fileName: 'aleatorio.pdf' });

  const response = await http(app)
    .post(`/documents/${extra}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'rejected', rejectionReason: 'Não é documento desta competência' })
    .expect(201);

  expect(response.body.data).toMatchObject({
    reviewStatus: 'rejected',
    rejectionReason: 'Não é documento desta competência',
  });
});

test('rejeitar Extra sem motivo é recusado com 422', async () => {
  const { cookie, token } = await setupReview(app);
  const extra = await uploadOk(app, token, { fileName: 'aleatorio.pdf' });

  const response = await http(app)
    .post(`/documents/${extra}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'rejected' })
    .expect(422);

  expect(response.body.error.code).toBe('VALIDATION_ERROR');

  const [row] = await db.select().from(document).where(eq(document.id, extra));
  expect(row.reviewStatus).toBe('pending');
});

test('revisar o mesmo Extra duas vezes responde 409', async () => {
  const { cookie, token } = await setupReview(app);
  const extra = await uploadOk(app, token, { fileName: 'aleatorio.pdf' });

  await http(app)
    .post(`/documents/${extra}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'accepted' })
    .expect(201);

  const segunda = await http(app)
    .post(`/documents/${extra}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'rejected', rejectionReason: 'Mudei de ideia' })
    .expect(409);

  expect(segunda.body.error.message).toMatch(/já está aceito/i);
});

test('Documento de Item pela rota de Extra responde 409', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'DAS pago');
  const documentId = await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: item.id });

  const response = await http(app)
    .post(`/documents/${documentId}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'accepted' })
    .expect(409);

  expect(response.body.error.message).toMatch(/pertence a um item/i);

  const [row] = await db.select().from(document).where(eq(document.id, documentId));
  expect(row.reviewStatus).toBe('pending');
});

test('Extra em awaiting_upload não é revisável: 409', async () => {
  const { cookie, token } = await setupReview(app);
  const fantasma = await presignOnly(app, token, { fileName: 'nunca-subiu.pdf' });

  const response = await http(app)
    .post(`/documents/${fantasma}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'accepted' })
    .expect(409);

  expect(response.body.error.message).toMatch(/ainda não foi enviado/i);
});

test('Extra revisado não muda nenhum Item nem entra na conta de complete', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const extra = await uploadOk(app, token, { fileName: 'extra.pdf' });

  const { last } = await acceptEveryItem(app, cookie, requestId, token);
  expect(last.requestStatus).toBe('complete');

  const antes = await itemsOf(app, cookie, requestId);

  await http(app)
    .post(`/documents/${extra}/review-extra`)
    .set('cookie', cookie)
    .send({ decision: 'rejected', rejectionReason: 'Fora do checklist' })
    .expect(201);

  const [row] = await db.select().from(request).where(eq(request.id, requestId));
  expect(row.status).toBe('complete');

  const depois = await itemsOf(app, cookie, requestId);
  expect(depois.map((item) => item.status)).toEqual(antes.map((item) => item.status));

  const itens = await db.select().from(requestItem).where(eq(requestItem.requestId, requestId));
  expect(itens.every((item) => item.status === 'accepted')).toBe(true);
});
