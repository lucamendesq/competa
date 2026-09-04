import type { INestApplication } from '@nestjs/common';
import { addDays, format } from 'date-fns';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import env from '../../../src/config/env.js';
import { uploadLink } from '../../../src/infra/database/schema/index.js';
import { hashToken } from '../../../src/lib/token.js';
import { createTestApp } from '../../app.js';
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
