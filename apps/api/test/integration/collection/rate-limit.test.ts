import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, http } from '../../app.js';
import { resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** Rate limit do fluxo público. Arquivo próprio porque o balde é do processo, não do
 *  banco: estourar o limite aqui não pode contaminar os vizinhos. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3981);
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

  return { token: opened.tokenFor('Padaria Central') };
};

const presignExtra = (token: string, fileName: string) =>
  http(app)
    .post(`/upload/${token}/documents`)
    .send({ files: [{ fileName, contentType: 'application/pdf', sizeBytes: 10 }] });

test('o presign tem limite próprio: o 21º pedido em 60s é 429 TOO_MANY_REQUESTS', async () => {
  const { token } = await setup();

  for (let index = 0; index < 20; index += 1) {
    await presignExtra(token, `dentro-do-limite-${index}.pdf`).expect(201);
  }

  const excedente = await presignExtra(token, 'estourou.pdf').expect(429);

  expect(excedente.body.error.code).toBe('TOO_MANY_REQUESTS');
  expect(excedente.body.error.message).toMatch(/Muitas requisições/);
});

test('o PUT do storage local NÃO é limitado: lote de N arquivos não é rajada', async () => {
  const { token } = await setup();
  const total = 40;
  const content = '%PDF lote';

  const presign = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      files: Array.from({ length: total }, (_, index) => ({
        fileName: `lote-${index}.pdf`,
        contentType: 'application/pdf',
        sizeBytes: Buffer.byteLength(content),
      })),
    })
    .expect(201);

  const entries = presign.body.data.files as { uploadUrl: string }[];
  expect(entries).toHaveLength(total);

  const statuses: number[] = [];
  for (const entry of entries) {
    const url = new URL(entry.uploadUrl);
    const response = await http(app)
      .put(url.pathname + url.search)
      .set('content-type', 'application/pdf')
      .send(Buffer.from(content));

    statuses.push(response.status);
  }

  expect(statuses.filter((status) => status === 429)).toEqual([]);
  expect(statuses.every((status) => status === 200)).toBe(true);
});
