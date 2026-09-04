import { afterAll, beforeAll, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { R2Storage } from '../../../src/infra/storage/r2.storage.js';

/** NADA aqui toca o Cloudflare R2: sem credencial real, o que se testa é a FORMA da URL
 *  pré-assinada (host, algoritmo, validade e o `content-length` DENTRO da assinatura —
 *  é ele que faz o limite de tamanho ser imposto em produção, não pedido). */

const original = {
  R2_ACCOUNT_ID: env.R2_ACCOUNT_ID,
  R2_ACCESS_KEY_ID: env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: env.R2_BUCKET,
};

let storage: R2Storage;

beforeAll(() => {
  Object.assign(env, {
    R2_ACCOUNT_ID: 'conta-falsa',
    R2_ACCESS_KEY_ID: 'chave-falsa',
    R2_SECRET_ACCESS_KEY: 'segredo-falso',
    R2_BUCKET: 'balde-falso',
  });

  storage = new R2Storage();
});

afterAll(() => {
  // o env é singleton do processo: deixar credencial falsa vazaria para outros arquivos
  Object.assign(env, original);
});

const presign = () =>
  storage.presignPut({
    storageKey: 'firm/abc/period/2026-07-01/request/def/doc.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
  });

test('a URL pré-assinada aponta para o endpoint do R2 da conta, com bucket e chave', async () => {
  const url = new URL(await presign());

  expect(url.protocol).toBe('https:');
  // endereçamento por virtual host: o bucket vira subdomínio da conta
  expect(url.host).toBe('balde-falso.conta-falsa.r2.cloudflarestorage.com');
  expect(url.pathname).toBe('/firm/abc/period/2026-07-01/request/def/doc.pdf');
});

test('a URL vem assinada (SigV4) e com validade de 900 segundos', async () => {
  const { searchParams } = new URL(await presign());

  expect(searchParams.get('X-Amz-Algorithm')).toBe('AWS4-HMAC-SHA256');
  expect(searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  expect(searchParams.get('X-Amz-Expires')).toBe('900');
  expect(searchParams.get('X-Amz-Credential')).toContain('chave-falsa');
  expect(searchParams.get('X-Amz-Date')).toMatch(/^\d{8}T\d{6}Z$/);
});

test('content-length entra na assinatura: o cliente não sobe mais do que declarou', async () => {
  const { searchParams } = new URL(await presign());

  const signed = searchParams.get('X-Amz-SignedHeaders')!.split(';');
  // `content-length` é o que importa: o R2 recusa PUT com corpo de outro tamanho.
  // `content-type` é enviado no PUT mas NÃO assinado (o SDK só assina host + o pedido).
  expect(signed).toEqual(['content-length', 'host']);
});

test('o checksum flexível do SDK não vai na assinatura (o R2 recusaria o PUT)', async () => {
  const { searchParams } = new URL(await presign());

  expect(searchParams.get('x-amz-checksum-crc32')).toBeNull();
  expect(searchParams.get('x-amz-sdk-checksum-algorithm')).toBeNull();
  expect(searchParams.get('X-Amz-SignedHeaders')).not.toContain('checksum');
});

test('assinaturas de chaves diferentes não se confundem', async () => {
  const outra = await storage.presignPut({
    storageKey: 'firm/abc/period/2026-07-01/request/def/outro.pdf',
    contentType: 'application/pdf',
    sizeBytes: 1234,
  });

  expect(new URL(await presign()).searchParams.get('X-Amz-Signature')).not.toBe(
    new URL(outra).searchParams.get('X-Amz-Signature'),
  );
});
