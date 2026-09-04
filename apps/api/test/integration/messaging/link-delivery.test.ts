import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { message } from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, insertCompany, openPeriod } from '../../factories.js';
import { spyProvider, waitFor } from './provider-spy.js';

/** Fase 5, entrega na abertura: uma `message` `link_delivery` por Solicitação, com o
 *  MESMO link que a resposta HTTP devolveu — o token em claro só existe ali. */

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

const messages = () => db.select().from(message);

test('abrir a Competência entrega um Link por Solicitação, com sent_at e o mesmo uploadUrl da resposta', async () => {
  const session = await createAccountantSession(app);
  const padaria = await createCompany(app, session.cookie, { name: 'Padaria Central' });
  await createCompany(app, session.cookie, { name: 'Zé Materiais' });

  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  expect(period.requests).toHaveLength(2);

  const rows = await waitFor(async () => {
    const all = await messages();
    // espera o `sent`: a linha nasce `queued` e o listener é assíncrono
    return all.length === 2 && all.every((row) => row.status !== 'queued') ? all : undefined;
  }, 'as duas mensagens de link_delivery não foram gravadas');

  expect(rows.every((row) => row.purpose === 'link_delivery')).toBe(true);
  expect(rows.every((row) => row.channel === 'email')).toBe(true);
  expect(rows.every((row) => row.status === 'sent')).toBe(true);
  expect(rows.every((row) => row.sentAt !== null)).toBe(true);
  expect(rows.every((row) => row.error === null)).toBe(true);
  expect(rows.map((row) => row.requestId).sort()).toEqual(
    period.requests.map((request) => request.id).sort(),
  );

  const requestPadaria = period.requests.find((row) => row.companyName === 'Padaria Central')!;
  const [linhaPadaria] = await messages().where(eq(message.requestId, requestPadaria.id));
  const contatoPadaria = await http(app)
    .get(`/companies/${padaria.id}`)
    .set('cookie', session.cookie)
    .expect(200);

  expect(linhaPadaria.recipient).toBe(contatoPadaria.body.data.contacts[0].email);

  const email = provider.lastTo(linhaPadaria.recipient)!;
  expect(email.body).toContain(requestPadaria.uploadUrl);
  expect(email.subject).toContain('Padaria Central');
});

test('Empresa ativa sem Responsável não gera Solicitação nem message — só aviso', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Com Responsável' });
  await insertCompany(session.firm.id, { name: 'Sem Responsável' });

  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(period.warnings.map((row) => row.companyName)).toEqual(['Sem Responsável']);
  expect(period.requests.map((row) => row.companyName)).toEqual(['Com Responsável']);

  const rows = await waitFor(async () => {
    const all = await messages();
    return all.length && all.every((row) => row.status !== 'queued') ? all : undefined;
  }, 'a mensagem da Empresa com Responsável não foi gravada');

  expect(rows).toHaveLength(1);
  expect(rows[0].requestId).toBe(period.requests[0].id);
  expect(provider.sent).toHaveLength(1);
});

test('o link entregue por email abre o checklist — é o token que vale', async () => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });

  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });
  const email = await waitFor(async () => provider.sent.at(0), 'nenhum email saiu');

  const token = email.body.match(/envio\/([A-Za-z0-9_-]+)/)![1];
  const checklist = await http(app).get(`/upload/${token}`).expect(200);

  expect(checklist.body.data.company).toBe('Padaria Central');
  expect(token).toBe(period.tokenFor('Padaria Central'));
});
