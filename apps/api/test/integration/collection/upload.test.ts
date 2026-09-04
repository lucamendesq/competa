import type { INestApplication } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { document } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** Regras do envio: lote, formatos, Documento Extra, Solicitação encerrada e a forma da
 *  `storage_key` (que nunca carrega o nome de arquivo do Responsável). */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3977);
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

const setup = async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const token = opened.tokenFor('Padaria Central');
  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const items = checklist.body.data.items as {
    id: string;
    name: string;
    acceptedFormats: string[];
  }[];

  return {
    session,
    opened,
    token,
    requestId: opened.requests[0].id,
    item: (name: string) => items.find((row) => row.name === name)!,
  };
};

const put = async (uploadUrl: string, content: string, contentType = 'application/pdf') => {
  const url = new URL(uploadUrl);
  await http(app)
    .put(url.pathname + url.search)
    .set('content-type', contentType)
    .send(Buffer.from(content));
};

test('um pedido com N arquivos gera N Documentos e confirma os N', async () => {
  const { token, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);
  const files = ['jan.pdf', 'fev.pdf', 'mar.pdf'].map((fileName) => ({
    fileName,
    contentType: 'application/pdf',
    sizeBytes: Buffer.byteLength(`%PDF ${fileName}`),
  }));

  const presign = await http(app)
    .post(`/upload/${token}/documents`)
    .send({ requestItemId: extrato.id, files })
    .expect(201);

  const entries = presign.body.data.files as {
    fileName: string;
    accepted: boolean;
    documentId: string;
    uploadUrl: string;
  }[];
  expect(entries.every((entry) => entry.accepted)).toBe(true);

  for (const entry of entries) await put(entry.uploadUrl, `%PDF ${entry.fileName}`);

  const confirm = await http(app)
    .post(`/upload/${token}/documents/confirm`)
    .send({ documentIds: entries.map((entry) => entry.documentId) })
    .expect(201);

  expect(confirm.body.data.confirmed).toBe(3);
  expect(confirm.body.data.refused).toEqual([]);
  expect(await db.select().from(document)).toHaveLength(3);
});

test('mais de 500 arquivos num pedido é recusado com 422 e não cria Documento', async () => {
  const { token, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);
  const files = Array.from({ length: 501 }, (_, index) => ({
    fileName: `nota-${index}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 10,
  }));

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({ requestItemId: extrato.id, files })
    .expect(422);

  expect(response.body.error.message).toMatch(/no máximo 500 arquivos/);
  expect(await db.select().from(document)).toHaveLength(0);
});

test('exatamente 500 arquivos é aceito (o limite não é excludente)', async () => {
  const { token, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);
  const files = Array.from({ length: 500 }, (_, index) => ({
    fileName: `nota-${index}.pdf`,
    contentType: 'application/pdf',
    sizeBytes: 10,
  }));

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({ requestItemId: extrato.id, files })
    .expect(201);

  expect(response.body.data.files).toHaveLength(500);
  expect(await db.select().from(document)).toHaveLength(500);
});

test('formato fora do checklist é recusado por arquivo, sem derrubar o lote', async () => {
  const { token, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);
  expect(extrato.acceptedFormats).toEqual(['pdf', 'ofx']);

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: extrato.id,
      files: [
        { fileName: 'extrato.pdf', contentType: 'application/pdf', sizeBytes: 10 },
        { fileName: 'planilha.xlsx', contentType: 'application/vnd.ms-excel', sizeBytes: 10 },
        { fileName: 'sem-extensao', contentType: 'aplicacao/desconhecida', sizeBytes: 10 },
      ],
    })
    .expect(201);

  const [ok, formato, semFormato] = response.body.data.files;
  expect(ok.accepted).toBe(true);
  expect(formato.accepted).toBe(false);
  expect(formato.reason).toMatch(/Formato \.xlsx não aceito/);
  expect(semFormato.accepted).toBe(false);
  expect(semFormato.reason).toMatch(/Não foi possível identificar o formato/);
  // só o arquivo aceito virou linha
  expect(await db.select().from(document)).toHaveLength(1);
});

test('zip é aceito como formato e guardado SEM extração', async () => {
  const { token, item } = await setup();
  const notas = item(CATALOG.nf_emitidas.name);
  expect(notas.acceptedFormats).toContain('zip');
  const content = 'PK conteudo compactado';

  const result = await uploadFile(app, token, {
    fileName: 'notas-julho.zip',
    contentType: 'application/zip',
    requestItemId: notas.id,
    content,
  });

  expect(result.accepted).toBe(true);
  if (!result.accepted) return;

  const rows = await db.select().from(document);
  expect(rows).toHaveLength(1);
  expect(rows[0].storageKey.endsWith('.zip')).toBe(true);

  const onDisk = await readFile(resolve(env.STORAGE_LOCAL_DIR, rows[0].storageKey), 'utf8');
  expect(onDisk).toBe(content);
});

test('Documento Extra (sem Item) é aceito e não fica preso aos formatos do checklist', async () => {
  const { token } = await setup();

  const result = await uploadFile(app, token, {
    fileName: 'observacoes.txt',
    contentType: 'text/plain',
    content: 'qualquer coisa',
  });

  expect(result.accepted).toBe(true);
  if (!result.accepted) return;

  const [row] = await db.select().from(document).where(eq(document.id, result.documentId));
  expect(row.requestItemId).toBeNull();
  expect(row.uploadStatus).toBe('uploaded');
});

test('Documento Extra continua aceito com a Solicitação ENCERRADA', async () => {
  const { token, session, requestId } = await setup();
  await http(app).post(`/requests/${requestId}/close`).set('cookie', session.cookie).expect(201);

  const result = await uploadFile(app, token, { fileName: 'nota-atrasada.pdf' });

  expect(result.accepted).toBe(true);
});

test('Item de Solicitação ENCERRADA não aceita envio: 422 apontando o Documento Extra', async () => {
  const { token, session, requestId, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);
  await http(app).post(`/requests/${requestId}/close`).set('cookie', session.cookie).expect(201);

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: extrato.id,
      files: [{ fileName: 'extrato.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
    })
    .expect(422);

  expect(response.body.error.message).toMatch(/Documento Extra/);
  expect(await db.select().from(document)).toHaveLength(0);
});

test('chave desconhecida dentro do arquivo é 422 — nunca um Documento Extra silencioso', async () => {
  const { token, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      files: [
        {
          fileName: 'extrato.pdf',
          contentType: 'application/pdf',
          sizeBytes: 10,
          requestItemId: extrato.id,
        },
      ],
    })
    .expect(422);

  expect(response.body.error.code).toBe('VALIDATION_ERROR');
  expect(await db.select().from(document)).toHaveLength(0);
});

test('storage_key não usa o nome do arquivo do Responsável nem escapa do prefixo', async () => {
  const { token, session, requestId, item } = await setup();
  const extrato = item(CATALOG.extrato_bancario.name);

  const presign = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: extrato.id,
      files: [
        {
          fileName: '../../../../etc/passwd.pdf',
          contentType: 'application/pdf',
          sizeBytes: 10,
        },
      ],
    })
    .expect(201);

  const [entry] = presign.body.data.files as { documentId: string; storageKey: string }[];

  expect(entry.storageKey).toBe(
    `firm/${session.firm.id}/period/2026-07-01/request/${requestId}/${entry.documentId}.pdf`,
  );
  expect(entry.storageKey).not.toContain('passwd');
  expect(entry.storageKey).not.toContain('..');

  const [row] = await db.select().from(document).where(eq(document.id, entry.documentId));
  expect(row.storageKey).toBe(entry.storageKey);
  // o nome original continua guardado para exibição, mas só como dado
  expect(row.fileName).toBe('../../../../etc/passwd.pdf');
});
