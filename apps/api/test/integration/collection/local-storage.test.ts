import type { INestApplication } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { LocalStorage } from '../../../src/infra/storage/local.storage.js';
import { createTestApp, http } from '../../app.js';
import { resetDatabase } from '../../db.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** O adapter de disco (substituto local do R2). A assinatura é a ÚNICA barreira do PUT:
 *  não há sessão nem token de link nessa rota. */

let app: INestApplication;
let storage: LocalStorage;

beforeAll(async () => {
  useOwnPort(3980);
  app = await createTestApp();
  storage = app.get(LocalStorage);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  resetThrottle(app);
});

/** Mesma conta do adapter — o teste precisa assinar para provar que a recusa é do
 *  `safePath`, e não da assinatura. */
const sign = (storageKey: string, expiresAt: number, sizeBytes: number) =>
  createHmac('sha256', env.BETTER_AUTH_SECRET)
    .update(`${storageKey}:${expiresAt}:${sizeBytes}`)
    .digest('hex');

const url = (
  storageKey: string,
  over: Partial<{ expiresAt: number; sizeBytes: number; signature: string }> = {},
) => {
  const expiresAt = over.expiresAt ?? Math.floor(Date.now() / 1000) + 900;
  const sizeBytes = over.sizeBytes ?? 100;
  const signature = over.signature ?? sign(storageKey, expiresAt, sizeBytes);

  return `/storage/local/${encodeURIComponent(storageKey)}?expiresAt=${expiresAt}&sizeBytes=${sizeBytes}&signature=${signature}`;
};

const putBinary = (path: string, content = 'conteudo') =>
  http(app).put(path).set('content-type', 'application/octet-stream').send(Buffer.from(content));

test('assinatura válida grava o objeto no diretório de storage', async () => {
  const key = 'firm/teste/assinatura-valida.bin';

  const response = await putBinary(url(key));

  expect(response.status).toBe(200);
  expect((await stat(resolve(env.STORAGE_LOCAL_DIR, key))).size).toBe(
    Buffer.byteLength('conteudo'),
  );
});

test('assinatura HMAC inválida é 403 e não grava nada', async () => {
  const key = 'firm/teste/assinatura-invalida.bin';

  const response = await putBinary(url(key, { signature: 'a'.repeat(64) }));

  expect(response.status).toBe(403);
  expect(response.body.error.code).toBe('FORBIDDEN');
  await expect(stat(resolve(env.STORAGE_LOCAL_DIR, key))).rejects.toThrow();
});

test('assinatura de outro objeto não serve para este (a chave entra no HMAC)', async () => {
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const other = sign('firm/teste/outro.bin', expiresAt, 100);

  const response = await putBinary(url('firm/teste/alvo.bin', { expiresAt, signature: other }));

  expect(response.status).toBe(403);
});

test('URL pré-assinada expirada é 403', async () => {
  const key = 'firm/teste/expirada.bin';

  const response = await putBinary(url(key, { expiresAt: Math.floor(Date.now() / 1000) - 1 }));

  expect(response.status).toBe(403);
  await expect(stat(resolve(env.STORAGE_LOCAL_DIR, key))).rejects.toThrow();
});

test('chave assinada que escapa do diretório de storage é 403', async () => {
  const response = await putBinary(url('../fuga-do-storage.bin'));

  expect(response.status).toBe(403);
  expect(response.body.error.message).toMatch(/Caminho de file inválido/);
  await expect(stat(resolve(env.STORAGE_LOCAL_DIR, '../fuga-do-storage.bin'))).rejects.toThrow();
});

test('PUT com content-type não binário é 422 — nunca um arquivo de 0 byte com 200', async () => {
  const key = 'firm/teste/drenado.bin';

  const response = await http(app)
    .put(url(key))
    .set('content-type', 'application/json')
    .send({ conteudo: 'json que o parser drena' });

  expect(response.status).toBe(422);
  expect(response.body.error.message).toMatch(/content-type binário/);
  await expect(stat(resolve(env.STORAGE_LOCAL_DIR, key))).rejects.toThrow();
});

test('statSize de objeto ausente é undefined (presign sem PUT), não erro', async () => {
  expect(await storage.statSize('firm/teste/nunca-subiu.bin')).toBeUndefined();
});

test('remove é idempotente: apagar duas vezes não quebra', async () => {
  const key = 'firm/teste/para-remover.bin';
  await putBinary(url(key)).expect(200);

  await storage.remove(key);
  await expect(storage.remove(key)).resolves.toBeUndefined();
  expect(await storage.statSize(key)).toBeUndefined();
});
