import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, http } from '../../app.js';
import { resetDatabase } from '../../db.js';
import { createCompany, openPeriod } from '../../factories.js';
import {
  downloadZip,
  drainDeliveries,
  itemNamed,
  openZip,
  presignOnly,
  rejectDocument,
  resetRateLimit,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Entrega em zip. O que importa é o arquivo que chega no disco do Contador: agrupamento,
 *  o que NÃO entra (rejeitado, envio não confirmado) e nome que o sistema de arquivos
 *  aceita. Aqui o zip é aberto de verdade com o `unzip` do sistema. */

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

test('zip da Solicitação agrupa por Item, com conteúdo íntegro', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const dasItem = await itemNamed(app, cookie, requestId, 'DAS pago');
  const inbox = await itemNamed(app, cookie, requestId, 'Livro caixa');

  await uploadOk(app, token, {
    fileName: 'das.pdf',
    requestItemId: dasItem.id,
    content: '%PDF guia do DAS',
  });
  await uploadOk(app, token, {
    fileName: 'caixa.pdf',
    requestItemId: inbox.id,
    content: '%PDF livro caixa de julho',
  });

  const response = await downloadZip(app, cookie, `/requests/${requestId}/zip`);
  expect(response.status).toBe(200);
  expect(response.headers['content-type']).toBe('application/zip');

  const zip = openZip(response.body);
  expect(zip.names.sort()).toEqual(['DAS pago/das.pdf', 'Livro caixa/caixa.pdf']);
  expect(zip.read('DAS pago/das.pdf')).toBe('%PDF guia do DAS');
  expect(zip.read('Livro caixa/caixa.pdf')).toBe('%PDF livro caixa de julho');
});

test('Documento rejeitado e envio não confirmado ficam FORA do zip', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const dasItem = await itemNamed(app, cookie, requestId, 'DAS pago');
  const inbox = await itemNamed(app, cookie, requestId, 'Livro caixa');

  const refused = await uploadOk(app, token, {
    fileName: 'errado.pdf',
    requestItemId: dasItem.id,
  });
  await presignOnly(app, token, { fileName: 'fantasma.pdf', requestItemId: inbox.id });

  const { response: rejection, token: freshToken } = await rejectDocument(
    app,
    cookie,
    refused,
    'Guia de outro mês',
  );
  expect(rejection.status).toBe(201);

  await uploadOk(app, freshToken!, {
    fileName: 'certo.pdf',
    requestItemId: dasItem.id,
    content: '%PDF guia certa',
  });

  const response = await downloadZip(app, cookie, `/requests/${requestId}/zip`);
  const zip = openZip(response.body);

  expect(zip.names).toEqual(['DAS pago/certo.pdf']);
  expect(zip.read('DAS pago/certo.pdf')).toBe('%PDF guia certa');
});

test('Documento Extra vai em pasta própria', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const dasItem = await itemNamed(app, cookie, requestId, 'DAS pago');

  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: dasItem.id });
  await uploadOk(app, token, { fileName: 'contrato.pdf', content: '%PDF contrato' });

  const response = await downloadZip(app, cookie, `/requests/${requestId}/zip`);
  const zip = openZip(response.body);

  expect(zip.names.sort()).toEqual(['DAS pago/das.pdf', 'Documentos Extra/contrato.pdf']);
  expect(zip.read('Documentos Extra/contrato.pdf')).toBe('%PDF contrato');
});

test('nome repetido no mesmo Item ganha sufixo em vez de sobrescrever', async () => {
  const { cookie, requestId, token } = await setupReview(app);
  const dasItem = await itemNamed(app, cookie, requestId, 'DAS pago');

  await uploadOk(app, token, {
    fileName: 'das.pdf',
    requestItemId: dasItem.id,
    content: '%PDF primeira via',
  });
  await uploadOk(app, token, {
    fileName: 'das.pdf',
    requestItemId: dasItem.id,
    content: '%PDF segunda via',
  });

  const response = await downloadZip(app, cookie, `/requests/${requestId}/zip`);
  const zip = openZip(response.body);

  expect(zip.names.sort()).toEqual(['DAS pago/das (2).pdf', 'DAS pago/das.pdf']);
  expect(zip.read('DAS pago/das.pdf')).toBe('%PDF primeira via');
  expect(zip.read('DAS pago/das (2).pdf')).toBe('%PDF segunda via');
});

test('content-disposition traz o nome do arquivo sem acento', async () => {
  const { cookie, requestId, token } = await setupReview(app, { companyName: 'Pão de Açúcar' });
  const dasItem = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: dasItem.id });

  const response = await downloadZip(app, cookie, `/requests/${requestId}/zip`);

  expect(response.headers['content-disposition']).toBe(
    'attachment; filename="pao-de-acucar-2026-07.zip"',
  );
});

test('zip da Competência agrupa por Empresa', async () => {
  const { cookie, requestId, period, token } = await setupReview(app, {
    companyName: 'Padaria Central',
  });
  await createCompany(app, cookie, { name: 'Mercado Central' });

  const dasItem = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, {
    fileName: 'das.pdf',
    requestItemId: dasItem.id,
    content: '%PDF padaria',
  });

  // a segunda Empresa entra no fan-out da competência seguinte
  const other = await openPeriod(app, cookie, { referenceMonth: '2026-08' });
  const mercado = other.requests.find((row) => row.companyName === 'Mercado Central')!;
  const marketToken = other.tokenFor('Mercado Central');
  const marketItem = await itemNamed(app, cookie, mercado.id, 'DAS pago');
  await uploadOk(app, marketToken, {
    fileName: 'das.pdf',
    requestItemId: marketItem.id,
    content: '%PDF mercado',
  });
  const bakeryToken = other.tokenFor('Padaria Central');
  const bakeryItem = await itemNamed(
    app,
    cookie,
    other.requests.find((row) => row.companyName === 'Padaria Central')!.id,
    'Livro caixa',
  );
  await uploadOk(app, bakeryToken, {
    fileName: 'caixa.pdf',
    requestItemId: bakeryItem.id,
    content: '%PDF caixa padaria',
  });

  const response = await downloadZip(app, cookie, `/periods/${other.id}/zip`);
  const zip = openZip(response.body);

  expect(zip.names.sort()).toEqual([
    'Mercado Central/DAS pago/das.pdf',
    'Padaria Central/Livro caixa/caixa.pdf',
  ]);
  expect(zip.read('Mercado Central/DAS pago/das.pdf')).toBe('%PDF mercado');
  expect(zip.read('Padaria Central/Livro caixa/caixa.pdf')).toBe('%PDF caixa padaria');

  // a competência anterior continua com o seu próprio conteúdo
  const previous = openZip((await downloadZip(app, cookie, `/periods/${period.id}/zip`)).body);
  expect(previous.names).toEqual(['Padaria Central/DAS pago/das.pdf']);
});

test('zip sem nenhum documento responde 404 com o motivo', async () => {
  const { cookie, requestId, period } = await setupReview(app);

  const ofRequest = await http(app)
    .get(`/requests/${requestId}/zip`)
    .set('cookie', cookie)
    .expect(404);
  expect(ofRequest.body.error.message).toMatch(/Nenhum document para baixar/i);
  // erro é erro: não pode sair rotulado como zip, senão o cliente baixa lixo
  expect(ofRequest.headers['content-type']).toMatch(/application\/json/);

  const ofPeriod = await http(app)
    .get(`/periods/${period.id}/zip`)
    .set('cookie', cookie)
    .expect(404);
  expect(ofPeriod.body.error.message).toMatch(/Nenhum document para baixar/i);
});

test('zip sem sessão responde 401', async () => {
  const { requestId, period } = await setupReview(app);

  await http(app).get(`/requests/${requestId}/zip`).expect(401);
  await http(app).get(`/periods/${period.id}/zip`).expect(401);
});
