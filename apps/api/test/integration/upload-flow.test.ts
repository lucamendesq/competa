import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, requestItem } from '../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../app.js';
import { db, resetDatabase } from '../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../factories.js';

/** Referência de estilo dos testes de integração: app real, banco real migrado, fluxo
 *  pelas rotas de verdade. Sem dublê de repositório — o que se prova aqui é comportamento
 *  observável, incluindo o que sobrou no banco. */

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
});

const setup = async () => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  return { session, company, period, token: period.tokenFor('Padaria Central') };
};

const itemNamed = async (token: string, fragment: string) => {
  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = checklist.body.data.items.find((row: { name: string }) =>
    row.name.includes(fragment),
  );
  if (!item) throw new Error(`Item "${fragment}" não está no checklist`);

  return item as { id: string; name: string; acceptedFormats: string[] };
};

test('link sem senha mostra o checklist e nunca devolve a chave do storage', async () => {
  const { token } = await setup();

  const response = await http(app).get(`/upload/${token}`).expect(200);

  expect(response.body.data.company).toBe('Padaria Central');
  expect(response.body.data.items.length).toBeGreaterThan(0);
  // sem envio, nenhum Item tem arquivo para listar
  expect(
    response.body.data.items.every((item: { documents: [] }) => item.documents.length === 0),
  ).toBe(true);
  /* Só-escrita: o Responsável vê nome e status do que mandou, nunca a chave que dá
   * acesso ao conteúdo — e não há rota de leitura sob o UploadTokenGuard. */
  expect(JSON.stringify(response.body.data)).not.toMatch(/storageKey|storage_key/);
});

test('upload confirmado marca o Item submitted e grava o tamanho real com autoria', async () => {
  const { token } = await setup();
  const item = await itemNamed(token, 'Extrato bancário');
  const content = '%PDF extrato de julho';

  const result = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
    content,
  });

  expect(result.accepted).toBe(true);
  if (!result.accepted) return;
  expect(result.confirm.submittedItemIds).toEqual([item.id]);

  const [row] = await db.select().from(document).where(eq(document.id, result.documentId));
  expect(row.uploadStatus).toBe('uploaded');
  expect(row.sizeBytes).toBe(Buffer.byteLength(content));
  expect(row.uploadedByContactId).not.toBeNull();

  const [savedItem] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(savedItem.status).toBe('submitted');
});

test('formato fora do checklist é recusado sem derrubar o lote', async () => {
  const { token } = await setup();
  const item = await itemNamed(token, 'Extrato bancário');

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: item.id,
      files: [
        { fileName: 'ok.pdf', contentType: 'application/pdf', sizeBytes: 10 },
        { fileName: 'virus.exe', contentType: 'application/octet-stream', sizeBytes: 10 },
      ],
    })
    .expect(201);

  const [ok, refused] = response.body.data.files;
  expect(ok.accepted).toBe(true);
  expect(refused.accepted).toBe(false);
  expect(refused.reason).toMatch(/Formato \.exe não aceito/);
});

test('documento sem confirmação não conta como enviado', async () => {
  const { token, period, session } = await setup();
  const item = await itemNamed(token, 'Extrato bancário');

  await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: item.id,
      files: [{ fileName: 'so-presign.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
    })
    .expect(201);

  const [row] = await db.select().from(document);
  expect(row.uploadStatus).toBe('awaiting_upload');
  expect(row.uploadedAt).toBeNull();

  const panel = await http(app)
    .get(`/requests/${period.requests[0].id}`)
    .set('cookie', session.cookie)
    .expect(200);

  const documents = panel.body.data.items.flatMap((i: { documents: [] }) => i.documents);
  expect(documents).toHaveLength(0);
});

test('token inexistente responde igual a token válido inexistente — sem revelar o motivo', async () => {
  const { token } = await setup();
  const valido = await http(app).get(`/upload/${token}`).expect(200);
  expect(valido.body.data.status).toBe('open');

  const inexistente = await http(app).get('/upload/token-que-nao-existe').expect(404);

  expect(inexistente.body.error.message).not.toMatch(/expirad|revogad|inexistent/i);
});
