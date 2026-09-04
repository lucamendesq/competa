import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, request, requestItem } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession } from '../../factories.js';
import {
  drainDeliveries,
  itemNamed,
  resetRateLimit,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Escopo por Contabilidade: recurso de outra Contabilidade não existe — 404, nunca
 *  403 nem 200. Vale para leitura E escrita, e o estado da vítima não pode mudar. */

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

/** Contabilidade A com uma Solicitação já em revisão + a sessão de uma Contabilidade B. */
const doisTenants = async () => {
  const a = await setupReview(app, {
    firmName: 'Contabilidade A',
    companyName: 'Empresa da A',
    dueDate: '2026-08-10',
  });
  const item = await itemNamed(app, a.cookie, a.requestId, 'DAS pago');
  const documentId = await uploadOk(app, a.token, {
    fileName: 'das.pdf',
    requestItemId: item.id,
  });
  const extra = await uploadOk(app, a.token, { fileName: 'contrato.pdf' });
  const b = await createAccountantSession(app, { firmName: 'Contabilidade B' });

  return { a, b, item, documentId, extra };
};

test('Contabilidade B recebe 404 na leitura dos recursos da A', async () => {
  const { a, b } = await doisTenants();

  for (const path of [
    `/requests/${a.requestId}`,
    `/requests/${a.requestId}/zip`,
    `/periods/${a.period.id}/zip`,
    `/periods/${a.period.id}/pending-panel`,
  ]) {
    const response = await http(app).get(path).set('cookie', b.cookie);

    expect(response.status, `GET ${path}`).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  }
});

test('Contabilidade B recebe 404 na escrita sobre os recursos da A e nada muda', async () => {
  const { a, b, item, documentId, extra } = await doisTenants();

  const escritas: [string, Record<string, unknown>][] = [
    [`/request-items/${item.id}/accept`, {}],
    [`/request-items/${item.id}/undo-accept`, {}],
    [`/documents/${documentId}/reject`, { rejectionReason: 'invadindo' }],
    [`/documents/${extra}/review-extra`, { decision: 'accepted' }],
    [`/requests/${a.requestId}/close`, {}],
    [`/periods/${a.period.id}/close`, {}],
  ];

  for (const [path, body] of escritas) {
    const response = await http(app).post(path).set('cookie', b.cookie).send(body);

    expect(response.status, `POST ${path}`).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  }

  const [salvoItem] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(salvoItem.status).toBe('submitted');

  const documentos = await db.select().from(document).where(eq(document.requestId, a.requestId));
  expect(documentos.every((row) => row.reviewStatus === 'pending')).toBe(true);

  const [solicitacao] = await db.select().from(request).where(eq(request.id, a.requestId));
  expect(solicitacao.status).toBe('open');
  expect(solicitacao.closedAt).toBeNull();
});

test('rotas de revisão sem sessão respondem 401', async () => {
  const { a, item, documentId } = await doisTenants();

  await http(app).get(`/requests/${a.requestId}`).expect(401);
  await http(app).get(`/periods/${a.period.id}/pending-panel`).expect(401);
  await http(app).post(`/request-items/${item.id}/accept`).expect(401);
  await http(app).post(`/request-items/${item.id}/undo-accept`).expect(401);
  await http(app)
    .post(`/documents/${documentId}/reject`)
    .send({ rejectionReason: 'sem sessão' })
    .expect(401);
  await http(app).post(`/requests/${a.requestId}/close`).expect(401);
  await http(app).post(`/periods/${a.period.id}/close`).expect(401);
  await http(app).post('/deadlines/scan').expect(401);
});
