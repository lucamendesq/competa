import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { message } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';
import { spyProvider, waitFor } from './provider-spy.js';

/** Os eventos de collection (revisão e varredura de prazo) chegam por rotas reais — nada
 *  de emitir no EventEmitter2 à mão: o que se prova é o caminho que o produto usa. */

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
});

const setup = async (referenceMonth = '2026-07') => {
  const session = await createAccountantSession(app);
  const company = await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const period = await openPeriod(app, session.cookie, { referenceMonth });
  const token = period.tokenFor('Padaria Central');
  const checklist = await http(app).get(`/upload/${token}`).expect(200);

  await waitFor(
    async () => (await db.select().from(message)).length > 0,
    'o link_delivery da abertura não foi gravado',
  );

  return {
    session,
    company,
    period,
    request: period.requests[0],
    token,
    items: checklist.body.data.items as { id: string; name: string }[],
  };
};

const messagesOfPurpose = (purpose: string) =>
  db
    .select()
    .from(message)
    .where(and(eq(message.purpose, purpose), eq(message.status, 'sent')));

const waitForPurpose = (purpose: string, count = 1) =>
  waitFor(async () => {
    const rows = await messagesOfPurpose(purpose);
    return rows.length >= count ? rows : undefined;
  }, `esperava ${count} message ${purpose}`);

test('rejeitar documento gera message rejection para o Responsável, só por email', async () => {
  const { session, token, items, request } = await setup();
  const uploaded = await uploadFile(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: items[0].id,
  });
  if (!uploaded.accepted) throw new Error('upload deveria ter sido aceito');

  await http(app)
    .post(`/documents/${uploaded.documentId}/reject`)
    .set('cookie', session.cookie)
    .send({ rejectionReason: 'Página faltando' })
    .expect(201);

  const rows = await waitForPurpose('rejection');

  expect(rows).toHaveLength(1);
  expect(rows[0].requestId).toBe(request.id);
  expect(rows[0].channel).toBe('email');
  expect(rows[0].recipient).not.toBe(session.email);
  expect(rows[0].recipient).toMatch(/@/);

  const email = provider.lastTo(rows[0].recipient)!;
  expect(email.subject).toContain(items[0].name);
  expect(email.body).toContain('Motivo: Página faltando');
  // o link do email de reabertura é o rotatado: o anterior deixou de valer
  expect(email.body).toMatch(/envio\/[A-Za-z0-9_-]+/);
  expect(email.body).not.toContain(`envio/${token}`);
});

test('aceitar o último Item gera message completion — e nenhuma antes disso', async () => {
  const { session, token, items } = await setup();

  for (const [index, item] of items.entries()) {
    const uploaded = await uploadFile(app, token, {
      fileName: `${item.id}.pdf`,
      requestItemId: item.id,
    });
    if (!uploaded.accepted) throw new Error(`upload de ${item.name} recusado`);

    const accept = await http(app)
      .post(`/request-items/${item.id}/accept`)
      .set('cookie', session.cookie)
      .expect(201);

    const ultimo = index === items.length - 1;
    expect(accept.body.data.completed).toBe(ultimo);

    if (!ultimo) expect(await messagesOfPurpose('completion')).toHaveLength(0);
  }

  const rows = await waitForPurpose('completion');
  expect(rows).toHaveLength(1);
  expect(provider.lastTo(rows[0].recipient)!.subject).toContain('Documentos recebidos');
});

test('prazo estourado avisa o Responsável (com link) e cada Contador (sem link)', async () => {
  const { session } = await setup('2026-01');

  // segundo Contador na MESMA Contabilidade, pelo fluxo real de convite
  const invite = await http(app)
    .post('/invites')
    .set('cookie', session.cookie)
    .send({ email: 'segundo-contador@teste.com' })
    .expect(201);

  await http(app)
    .post('/auth/sign-up')
    .query({ token: invite.body.data.url.split('/').pop() })
    .send({
      name: 'Segundo Contador',
      email: 'segundo-contador@teste.com',
      password: 'senha-forte-123',
    })
    .expect(201);

  const scan = await http(app).post('/deadlines/scan').set('cookie', session.cookie).expect(201);
  const notifiedItems = scan.body.data.notified.length as number;
  expect(notifiedItems).toBeGreaterThan(0);

  // por item avisado: 1 email para o Responsável + 1 para cada Contador
  const expected = notifiedItems * 3;
  const rows = await waitForPurpose('deadline_missed', expected);
  expect(rows).toHaveLength(expected);

  const recipients = new Set(rows.map((row) => row.recipient));
  expect(recipients.has(session.email)).toBe(true);
  expect(recipients.has('segundo-contador@teste.com')).toBe(true);
  expect(recipients.size).toBe(3);

  const ofAccountant = provider.lastTo(session.email)!;
  expect(ofAccountant.body).not.toContain('/envio/');
  expect(ofAccountant.body).toContain('não enviou');

  const contact = [...recipients].find(
    (email) => email !== session.email && email !== 'segundo-contador@teste.com',
  )!;
  expect(provider.lastTo(contact)!.body).toMatch(/envio\/[A-Za-z0-9_-]+/);
});

test('convite manda email sem criar linha em message', async () => {
  const session = await createAccountantSession(app);
  provider.reset();

  const response = await http(app)
    .post('/invites')
    .set('cookie', session.cookie)
    .send({ email: 'convidado@teste.com' })
    .expect(201);

  const email = await waitFor(
    async () => provider.lastTo('convidado@teste.com'),
    'o email do convite não saiu',
  );

  expect(email.body).toContain(response.body.data.url);
  expect(await db.select().from(message)).toHaveLength(0);
});
