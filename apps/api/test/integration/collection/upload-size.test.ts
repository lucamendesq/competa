import type { INestApplication } from '@nestjs/common';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { document, requestItem } from '../../../src/infra/database/schema/index.js';
import { CATALOG } from '../../../src/infra/database/seeds/001-document-types-and-templates.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** O limite de tamanho é IMPOSTO, não pedido: o presign assina o tamanho, o storage corta
 *  o que passa e a confirmação confere o objeto real. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3978);
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
  const items = checklist.body.data.items as { id: string; name: string }[];

  return {
    session,
    token,
    extratoId: items.find((row) => row.name === CATALOG.extrato_bancario.name)!.id,
  };
};

const presign = async (
  token: string,
  file: { fileName: string; sizeBytes: number },
  requestItemId?: string,
) => {
  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      ...(requestItemId ? { requestItemId } : {}),
      files: [{ fileName: file.fileName, contentType: 'application/pdf', sizeBytes: file.sizeBytes }],
    })
    .expect(201);

  return response.body.data.files[0] as {
    accepted: boolean;
    reason?: string;
    documentId?: string;
    storageKey?: string;
    uploadUrl?: string;
  };
};

const put = (uploadUrl: string, content: string) => {
  const url = new URL(uploadUrl);

  return http(app)
    .put(url.pathname + url.search)
    .set('content-type', 'application/pdf')
    .send(Buffer.from(content));
};

const exists = async (storageKey: string) =>
  stat(resolve(env.STORAGE_LOCAL_DIR, storageKey))
    .then(() => true)
    .catch(() => false);

test('arquivo MENOR que o declarado é recusado na confirmação, com motivo e sem sobra', async () => {
  const { token, extratoId } = await setup();
  const entry = await presign(token, { fileName: 'extrato.pdf', sizeBytes: 1000 }, extratoId);
  expect(entry.accepted).toBe(true);

  await put(entry.uploadUrl!, '%PDF curto');

  const confirm = await http(app)
    .post(`/upload/${token}/documents/confirm`)
    .send({ documentIds: [entry.documentId] })
    .expect(201);

  expect(confirm.body.data.confirmed).toBe(0);
  expect(confirm.body.data.refused[0].reason).toMatch(/não tem o tamanho declarado/);
  // linha e objeto descartados: nem documento fantasma no banco nem lixo no storage
  expect(await db.select().from(document)).toHaveLength(0);
  expect(await exists(entry.storageKey!)).toBe(false);
  const [item] = await db.select().from(requestItem).where(eq(requestItem.id, extratoId));
  expect(item.status).toBe('pending');
});

test('arquivo MAIOR que o declarado é cortado no PUT com 413 e não deixa parcial no disco', async () => {
  const { token, extratoId } = await setup();
  const entry = await presign(token, { fileName: 'extrato.pdf', sizeBytes: 10 }, extratoId);

  const response = await put(entry.uploadUrl!, 'x'.repeat(5000));

  expect(response.status).toBe(413);
  expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  expect(await exists(entry.storageKey!)).toBe(false);
});

test('arquivo acima de 100 MB é recusado já no presign, sem criar linha', async () => {
  const { token, extratoId } = await setup();

  const entry = await presign(
    token,
    { fileName: 'gigante.pdf', sizeBytes: 100 * 1024 * 1024 + 1 },
    extratoId,
  );

  expect(entry.accepted).toBe(false);
  expect(entry.reason).toMatch(/acima do limite de 100 MB/);
  expect(entry.uploadUrl).toBeUndefined();
  expect(await db.select().from(document)).toHaveLength(0);
});

test('a confirmação grava o tamanho REAL do storage, não o declarado', async () => {
  const { token, extratoId } = await setup();
  const content = '%PDF extrato de julho';
  const entry = await presign(
    token,
    { fileName: 'extrato.pdf', sizeBytes: Buffer.byteLength(content) },
    extratoId,
  );

  await put(entry.uploadUrl!, content);
  await http(app)
    .post(`/upload/${token}/documents/confirm`)
    .send({ documentIds: [entry.documentId] })
    .expect(201);

  const [row] = await db.select().from(document).where(eq(document.id, entry.documentId!));
  const onDisk = await stat(resolve(env.STORAGE_LOCAL_DIR, entry.storageKey!));
  expect(row.sizeBytes).toBe(onDisk.size);
  expect(row.uploadStatus).toBe('uploaded');
});

test('confirmar duas vezes o mesmo documento não duplica nem re-submete o Item', async () => {
  const { token, extratoId } = await setup();
  const content = '%PDF extrato de julho';
  const entry = await presign(
    token,
    { fileName: 'extrato.pdf', sizeBytes: Buffer.byteLength(content) },
    extratoId,
  );
  await put(entry.uploadUrl!, content);
  await http(app)
    .post(`/upload/${token}/documents/confirm`)
    .send({ documentIds: [entry.documentId] })
    .expect(201);

  const [first] = await db.select().from(document).where(eq(document.id, entry.documentId!));

  const again = await http(app)
    .post(`/upload/${token}/documents/confirm`)
    .send({ documentIds: [entry.documentId] })
    .expect(404);

  expect(again.body.error.code).toBe('NOT_FOUND');
  const rows = await db.select().from(document);
  expect(rows).toHaveLength(1);
  expect(rows[0].uploadedAt).toEqual(first.uploadedAt);
  const [item] = await db.select().from(requestItem).where(eq(requestItem.id, extratoId));
  expect(item.status).toBe('submitted');
});
