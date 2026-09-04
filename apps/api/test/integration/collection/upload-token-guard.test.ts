import type { INestApplication } from '@nestjs/common';
import { subDays } from 'date-fns';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { document, uploadLink } from '../../../src/infra/database/schema/index.js';
import { hashToken } from '../../../src/lib/token.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** UploadTokenGuard: a fronteira do fluxo público. Um token só alcança a própria
 *  Solicitação, e link inválido não revela POR QUE é inválido. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3976);
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
  await createCompany(app, session.cookie, { name: 'Mercado do Bairro' });
  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  return {
    session,
    opened,
    token: opened.tokenFor('Padaria Central'),
    otherToken: opened.tokenFor('Mercado do Bairro'),
  };
};

const firstItem = async (token: string) => {
  const checklist = await http(app).get(`/upload/${token}`).expect(200);

  return (checklist.body.data.items as { id: string; name: string }[])[0];
};

test('inexistente, expirado e revogado devolvem exatamente a MESMA resposta', async () => {
  const { token, otherToken } = await setup();

  const inexistente = await http(app).get('/upload/token-que-nunca-existiu').expect(404);

  await db
    .update(uploadLink)
    .set({ expiresAt: subDays(new Date(), 1) })
    .where(eq(uploadLink.tokenHash, hashToken(token)));
  const expirado = await http(app).get(`/upload/${token}`).expect(404);

  await db.update(uploadLink).set({ revoked: true });
  const revogado = await http(app).get(`/upload/${otherToken}`).expect(404);

  for (const response of [inexistente, expirado, revogado]) {
    expect(response.body.error.code).toBe('UPLOAD_LINK_INVALID');
    expect(response.body.error.message).toBe(inexistente.body.error.message);
  }
  expect(inexistente.body.error.message).not.toMatch(/expirad|revogad|inexistent|não existe/i);
});

test('token de outra Solicitação não alcança Item desta', async () => {
  const { token, otherToken } = await setup();
  const alheio = await firstItem(otherToken);

  const response = await http(app)
    .post(`/upload/${token}/documents`)
    .send({
      requestItemId: alheio.id,
      files: [{ fileName: 'nota.pdf', contentType: 'application/pdf', sizeBytes: 10 }],
    })
    .expect(404);

  expect(response.body.error.code).toBe('NOT_FOUND');
  expect(await db.select().from(document)).toHaveLength(0);
});

test('token de outra Solicitação não confirma Documento desta', async () => {
  const { token, otherToken } = await setup();
  const item = await firstItem(token);
  const uploaded = await uploadFile(app, token, {
    fileName: 'nota.pdf',
    requestItemId: item.id,
  });
  expect(uploaded.accepted).toBe(true);
  if (!uploaded.accepted) return;

  const response = await http(app)
    .post(`/upload/${otherToken}/documents/confirm`)
    .send({ documentIds: [uploaded.documentId] })
    .expect(404);

  expect(response.body.error.code).toBe('NOT_FOUND');
});

test('a página pública funciona SEM sessão e ignora sessão de Contador', async () => {
  const { token, session } = await setup();

  const anonimo = await http(app).get(`/upload/${token}`).expect(200);
  const comSessao = await http(app).get(`/upload/${token}`).set('cookie', session.cookie).expect(200);

  expect(comSessao.body.data).toEqual(anonimo.body.data);
  expect(JSON.stringify(comSessao.body.data)).not.toMatch(/fileName|storageKey|documents/);
});

test('sessão de Contador não salva token inválido (sem escalada de privilégio)', async () => {
  const { session } = await setup();

  const response = await http(app)
    .get('/upload/token-que-nunca-existiu')
    .set('cookie', session.cookie)
    .expect(404);

  expect(response.body.error.code).toBe('UPLOAD_LINK_INVALID');
});
