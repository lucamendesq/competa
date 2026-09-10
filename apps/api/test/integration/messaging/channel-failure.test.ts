import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { invite, message, requestItem } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';
import { spyProvider, waitFor } from './provider-spy.js';

/** Invariante das regras 9/10: falha de canal NUNCA bloqueia o fluxo. Com o provider
 *  lançando, o ato de negócio continua concluído e a falha vira `status='failed'` +
 *  `error` — que é o que o Painel de Pendências mostra. */

let app: INestApplication;
let provider: ReturnType<typeof spyProvider>;

beforeAll(async () => {
  app = await createTestApp();
  provider = spyProvider(app);
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDatabase();
  provider.reset();
  provider.breakChannel('provedor de email fora do ar');
});

const failures = () => db.select().from(message).where(eq(message.status, 'failed'));

const waitForFailures = (count: number) =>
  waitFor(async () => {
    const rows = await failures();
    return rows.length >= count ? rows : undefined;
  }, `esperava ${count} linha(s) failed em message`);

test('abrir a Competência conclui mesmo com o canal quebrado, e a falha fica registrada', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });

  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(period.requests).toHaveLength(1);
  expect(period.requests[0].itemCount).toBeGreaterThan(0);

  const panel = await http(app)
    .get(`/requests/${period.requests[0].id}`)
    .set('cookie', session.cookie)
    .expect(200);
  expect(panel.body.data.items.length).toBe(period.requests[0].itemCount);

  const [row] = await waitForFailures(1);
  expect(row.purpose).toBe('link_delivery');
  expect(row.status).toBe('failed');
  expect(row.error).toContain('provedor de email fora do ar');
  expect(row.sentAt).toBeNull();
});

test('a rejeição continua gravada mesmo com o email de reenvio falhando', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const token = period.tokenFor('Padaria Central');

  const checklist = await http(app).get(`/upload/${token}`).expect(200);
  const item = checklist.body.data.items[0] as { id: string };
  const uploaded = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
  });
  if (!uploaded.accepted) throw new Error('upload deveria ter sido aceito');

  const rejection = await http(app)
    .post(`/documents/${uploaded.documentId}/reject`)
    .set('cookie', session.cookie)
    .send({ rejectionReason: 'Página faltando' })
    .expect(201);

  expect(rejection.body.data.itemStatus).toBe('pending');
  expect(rejection.body.data.linkRotated).toBe(true);

  const [savedItem] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(savedItem.status).toBe('pending');

  const [row] = await waitFor(async () => {
    const rows = await db
      .select()
      .from(message)
      .where(and(eq(message.purpose, 'rejection'), eq(message.status, 'failed')));
    return rows.length ? rows : undefined;
  }, 'a falha do email de rejeição não foi registrada');

  expect(row.error).toContain('provedor de email fora do ar');
});

test('prazo estourado com email fora do ar: registra a falha e NÃO marca o item como avisado', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  // competência antiga: os prazos dos itens (dia 5) já venceram
  await openPeriod(app, session.cookie, { referenceMonth: '2026-01' });

  const scan = await http(app).post('/deadlines/scan').set('cookie', session.cookie).expect(201);

  expect(scan.body.data.overdue).toBeGreaterThan(0);
  /* Canal quebrado não conta como "avisado": `deadline_notified_at` é idempotência, e
   * marcá-lo aqui faria a varredura de amanhã pular o item para sempre — o Responsável
   * nunca saberia do prazo. */
  expect(scan.body.data.notified).toHaveLength(0);

  const rows = await waitFor(async () => {
    const all = await db.select().from(message).where(eq(message.purpose, 'deadline_missed'));
    const done = all.filter((row) => row.status === 'failed');
    return done.length >= 2 && done.length === all.length ? done : undefined;
  }, 'as falhas de deadline_missed não foram registradas');

  expect(rows.some((row) => row.recipient === session.email)).toBe(true);
  expect(rows.some((row) => row.recipient !== session.email)).toBe(true);
  expect(rows.every((row) => row.error)).toBeTruthy();

  // sem marca, a próxima varredura tenta de novo
  const items = await db.select().from(requestItem);
  expect(items.every((row) => row.deadlineNotifiedAt === null)).toBe(true);
});

test('convite: falha de email não derruba a criação do convite, e não cria linha em message', async () => {
  const session = await createAccountantSession(app);

  const response = await http(app)
    .post('/invites')
    .set('cookie', session.cookie)
    .send({ email: 'novo-contador@teste.com' })
    .expect(201);

  expect(response.body.data.url).toContain('/convite/');

  const invites = await db.select().from(invite).where(eq(invite.email, 'novo-contador@teste.com'));
  expect(invites).toHaveLength(1);

  // o convite não tem Solicitação a que amarrar: `message.request_id` é not null
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect(await db.select().from(message)).toHaveLength(0);

  const preview = await http(app)
    .get(`/invites/${response.body.data.url.split('/').pop()}`)
    .expect(200);
  expect(preview.body.data.email).toBe('novo-contador@teste.com');
});
