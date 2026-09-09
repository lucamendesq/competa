import type { INestApplication } from '@nestjs/common';
import { addDays, format } from 'date-fns';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { uploadLink } from '../../../src/infra/database/schema/index.js';
import { hashToken } from '../../../src/lib/token.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod } from '../../factories.js';
import { resetThrottle, useOwnPort } from './_helpers.js';

/** Link de Upload: um por Solicitação, só o hash persistido, expiração pelo TTL do env. */

let app: INestApplication;

beforeAll(async () => {
  useOwnPort(3975);
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

  return { session, opened, token: opened.tokenFor('Padaria Central') };
};

test('cada Solicitação nasce com exatamente UM Link de Upload', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Mercado do Bairro' });

  const opened = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  const links = await db.select().from(uploadLink);
  expect(links).toHaveLength(2);
  expect(new Set(links.map((row) => row.requestId))).toEqual(
    new Set(opened.requests.map((row) => row.id)),
  );
});

test('o token em claro NUNCA é persistido — só o hash', async () => {
  const { token } = await setup();

  const [link] = await db.select().from(uploadLink);

  expect(link.tokenHash).toBe(hashToken(token));
  expect(link.tokenHash).not.toBe(token);
  // o token em claro não aparece em nenhuma coluna da linha
  expect(JSON.stringify(link)).not.toContain(token);

  const byPlainToken = await db.select().from(uploadLink).where(eq(uploadLink.tokenHash, token));
  expect(byPlainToken).toHaveLength(0);
});

test('expires_at do Link é hoje + UPLOAD_LINK_TTL_DAYS', async () => {
  await setup();

  const [link] = await db.select().from(uploadLink);

  expect(format(link.expiresAt, 'yyyy-MM-dd')).toBe(
    format(addDays(new Date(), env.UPLOAD_LINK_TTL_DAYS), 'yyyy-MM-dd'),
  );
});

test('o Link nasce ativo (não revogado)', async () => {
  await setup();

  const [link] = await db.select().from(uploadLink);

  expect(link.revoked).toBe(false);
});

test('reenvio pelo Contador troca o token: o novo vale, o anterior morre', async () => {
  const { session, opened, token } = await setup();
  const requestId = opened.requests.find((row) => row.companyName === 'Padaria Central')!.id;

  const response = await http(app)
    .post(`/requests/${requestId}/upload-link/resend`)
    .set('cookie', session.cookie)
    .expect(201);

  const fresh = (response.body.data.uploadUrl as string).split('/').pop()!;
  expect(fresh).not.toBe(token);

  await http(app).get(`/upload/${fresh}`).expect(200);
  await http(app).get(`/upload/${token}`).expect(404);
});

test('Solicitação de outra Contabilidade não existe para o reenvio', async () => {
  const { opened } = await setup();
  const requestId = opened.requests.find((row) => row.companyName === 'Padaria Central')!.id;
  const stranger = await createAccountantSession(app, { firmName: 'Outra Contabilidade' });

  await http(app)
    .post(`/requests/${requestId}/upload-link`)
    .set('cookie', stranger.cookie)
    .expect(404);
});

test('Solicitação encerrada não gera link novo', async () => {
  const { session, opened } = await setup();
  const requestId = opened.requests.find((row) => row.companyName === 'Padaria Central')!.id;

  await http(app).post(`/requests/${requestId}/close`).set('cookie', session.cookie).expect(201);

  await http(app)
    .post(`/requests/${requestId}/upload-link`)
    .set('cookie', session.cookie)
    .expect(409);
});
