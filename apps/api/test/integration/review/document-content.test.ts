import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, http } from '../../app.js';
import { resetDatabase } from '../../db.js';
import {
  downloadZip,
  drainDeliveries,
  itemNamed,
  presignOnly,
  resetRateLimit,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Preview no painel: o Contador precisa ver o arquivo antes de aceitar. Até aqui o único
 *  caminho até o conteúdo era o zip da empresa inteira. */

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

test('o conteúdo sai inline, com o content-type e o nome do arquivo enviado', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, {
    fileName: 'extrato março.pdf',
    requestItemId: item.id,
    content: 'conteudo-do-extrato',
  });

  // `downloadZip` é só um GET binário com cookie (o parser JSON do supertest engoliria o
  // corpo): serve igual para o conteúdo de um documento.
  const response = await downloadZip(app, cookie, `/documents/${documentId}/content`).expect(200);

  expect(response.headers['content-type']).toContain('application/pdf');
  expect(response.headers['content-disposition']).toContain('inline');
  // nome com espaço/acento vai percent-encoded: header cru quebraria o download
  expect(response.headers['content-disposition']).toContain('extrato%20mar%C3%A7o.pdf');
  expect(response.body.toString()).toContain('conteudo-do-extrato');
});

test('documento de outra Contabilidade responde 404', async () => {
  const target = await setupReview(app, { firmName: 'Contabilidade A', companyName: 'Empresa A' });
  const intruder = await setupReview(app, {
    firmName: 'Contabilidade B',
    companyName: 'Empresa B',
  });
  const item = await itemNamed(app, target.cookie, target.requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, target.token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
  });

  await http(app)
    .get(`/documents/${documentId}/content`)
    .set('cookie', intruder.cookie)
    .expect(404);
});

test('documento que pediu URL e nunca confirmou responde 404 — a linha existe, o arquivo não', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await presignOnly(app, token, {
    fileName: 'fantasma.pdf',
    requestItemId: item.id,
  });

  await http(app).get(`/documents/${documentId}/content`).set('cookie', cookie).expect(404);
});

test('sem sessão o conteúdo não sai', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
  });

  await http(app).get(`/documents/${documentId}/content`).expect(401);
});
