import type { INestApplication } from '@nestjs/common';
import { addDays, format } from 'date-fns';
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import {
  message,
  period as periodTable,
  requestItem,
  uploadLink,
} from '../../../src/infra/database/schema/index.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, openPeriod, uploadFile } from '../../factories.js';
import { spyProvider, waitFor } from './provider-spy.js';

/** Cadência de lembretes (docs/domain.md, risco 2): UM lembrete por Solicitação agrupando
 *  todos os itens pendentes, no máximo 2 por Solicitação, com prazo a partir de D-3 (gap
 *  mínimo de 3 dias) e sem prazo semanal. A passagem do tempo é simulada envelhecendo
 *  `message.created_at` — o que a regra lê é isso. */

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

const iso = (date: Date) => format(date, 'yyyy-MM-dd');

const setup = async (body: { referenceMonth: string; dueDate?: string }) => {
  const session = await createAccountantSession(app);
  await createCompany(app, session.cookie, { name: 'Padaria Central' });
  const period = await openPeriod(app, session.cookie, body);
  const token = period.tokenFor('Padaria Central');
  const checklist = await http(app).get(`/upload/${token}`).expect(200);

  // a entrega da abertura é assíncrona: sem esperar, o lembrete leria um estado a meio
  await waitFor(
    async () => (await db.select().from(message).where(isNotNull(message.sentAt))).length > 0,
    'o link_delivery da abertura não foi gravado',
  );

  return {
    session,
    period,
    request: period.requests[0],
    token,
    items: checklist.body.data.items as { id: string; name: string }[],
  };
};

/** "Faz N dias que a última mensagem saiu" — sem esperar o calendário. */
const ageMessages = (days: number) =>
  db.execute(
    sql`update message set created_at = now() - ${sql.raw(`interval '${days} days'`)}`,
  );

const runReminders = async (cookie: string) => {
  const response = await http(app).post('/messages/reminders/run').set('cookie', cookie).expect(201);

  return response.body.data as { scanned: number; sent: number };
};

const reminders = () => db.select().from(message).where(eq(message.purpose, 'reminder'));

test('um lembrete por Solicitação, agrupando todos os itens pendentes — não um por item', async () => {
  const { session, items, request } = await setup({ referenceMonth: '2026-07' });
  expect(items.length).toBeGreaterThan(1);

  await ageMessages(4);
  const result = await runReminders(session.cookie);

  expect(result).toEqual({ scanned: 1, sent: 1 });

  const rows = await reminders();
  expect(rows).toHaveLength(1);
  expect(rows[0].requestId).toBe(request.id);
  expect(rows[0].status).toBe('sent');

  const email = provider.lastTo(rows[0].recipient)!;
  expect(email.body).toContain(`${items.length} documento(s)`);
  for (const item of items) expect(email.body).toContain(item.name);
});

test('teto de 2 lembretes por Solicitação: a terceira varredura não manda nada', async () => {
  const { session } = await setup({ referenceMonth: '2026-07' });

  await ageMessages(4);
  expect((await runReminders(session.cookie)).sent).toBe(1);

  await ageMessages(4);
  expect((await runReminders(session.cookie)).sent).toBe(1);

  await ageMessages(4);
  const terceira = await runReminders(session.cookie);

  expect(terceira.sent).toBe(0);
  expect(terceira.scanned).toBe(1);
  expect(await reminders()).toHaveLength(2);
});

test('com prazo: nada antes de D-3, lembrete a partir de D-3', async () => {
  const { session, items } = await setup({ referenceMonth: '2026-09' });

  // prazo longe: 10 dias à frente em todos os itens pendentes
  await db.update(requestItem).set({ dueDate: iso(addDays(new Date(), 10)) });
  await ageMessages(9);
  expect((await runReminders(session.cookie)).sent).toBe(0);

  // prazo em D-3
  await db
    .update(requestItem)
    .set({ dueDate: iso(addDays(new Date(), 3)) })
    .where(eq(requestItem.id, items[0].id));
  expect((await runReminders(session.cookie)).sent).toBe(1);
});

test('com prazo: gap mínimo de 3 dias entre lembretes', async () => {
  const { session } = await setup({ referenceMonth: '2026-09' });

  await db.update(requestItem).set({ dueDate: iso(addDays(new Date(), 1)) });

  await ageMessages(2);
  expect((await runReminders(session.cookie)).sent).toBe(0);

  await ageMessages(3);
  expect((await runReminders(session.cookie)).sent).toBe(1);
});

test('sem prazo algum: cadência semanal', async () => {
  const { session } = await setup({ referenceMonth: '2026-09' });

  // nem Item nem Competência com prazo
  await db.update(requestItem).set({ dueDate: null });
  await db.update(periodTable).set({ dueDate: null });

  await ageMessages(6);
  expect((await runReminders(session.cookie)).sent).toBe(0);

  await ageMessages(7);
  expect((await runReminders(session.cookie)).sent).toBe(1);
});

test('Solicitação encerrada fica fora da varredura', async () => {
  const { session, request } = await setup({ referenceMonth: '2026-07' });

  await http(app).post(`/requests/${request.id}/close`).set('cookie', session.cookie).expect(201);
  await ageMessages(9);

  expect(await runReminders(session.cookie)).toEqual({ scanned: 0, sent: 0 });
  expect(await reminders()).toHaveLength(0);
});

test('Competência encerrada fica fora da varredura', async () => {
  const { session, period } = await setup({ referenceMonth: '2026-07' });

  await http(app).post(`/periods/${period.id}/close`).set('cookie', session.cookie).expect(201);
  await ageMessages(9);

  expect(await runReminders(session.cookie)).toEqual({ scanned: 0, sent: 0 });
});

test('Solicitação com tudo enviado (nenhum item pendente) fica fora', async () => {
  const { session, token, items } = await setup({ referenceMonth: '2026-07' });

  for (const item of items) {
    const uploaded = await uploadFile(app, token, {
      fileName: `${item.id}.pdf`,
      requestItemId: item.id,
    });
    if (!uploaded.accepted) throw new Error(`upload de ${item.name} recusado`);
  }

  await ageMessages(9);
  expect(await runReminders(session.cookie)).toEqual({ scanned: 0, sent: 0 });
});

test('Item rejeitado conta como pendente e volta a ser cobrado', async () => {
  const { session, token, items } = await setup({ referenceMonth: '2026-07' });

  for (const item of items) {
    const uploaded = await uploadFile(app, token, {
      fileName: `${item.id}.pdf`,
      requestItemId: item.id,
    });
    if (!uploaded.accepted) throw new Error(`upload de ${item.name} recusado`);
  }

  // `rejected` no Item não é alcançável por rota (a rejeição do Documento devolve o Item
  // para `pending`), mas é status normativo do schema: aqui se prova que a varredura o
  // trata como pendente.
  await db
    .update(requestItem)
    .set({ status: 'rejected' })
    .where(eq(requestItem.id, items[0].id));

  await ageMessages(9);
  const result = await runReminders(session.cookie);

  expect(result).toEqual({ scanned: 1, sent: 1 });
  const email = provider.lastTo((await reminders())[0].recipient)!;
  expect(email.body).toContain('1 documento(s)');
  expect(email.body).toContain(items[0].name);
});

test('lembrete entregue leva link NOVO, que funciona, e aposenta o anterior', async () => {
  const { session, token, request } = await setup({ referenceMonth: '2026-07' });
  const [antes] = await db.select().from(uploadLink).where(eq(uploadLink.requestId, request.id));

  await ageMessages(4);
  expect((await runReminders(session.cookie)).sent).toBe(1);

  const [depois] = await db.select().from(uploadLink).where(eq(uploadLink.requestId, request.id));
  expect(depois.tokenHash).not.toBe(antes.tokenHash);
  expect(depois.id).toBe(antes.id);

  const [linha] = await reminders();
  const novoToken = provider.lastTo(linha.recipient)!.body.match(/envio\/([A-Za-z0-9_-]+)/)![1];
  expect(novoToken).not.toBe(token);

  const checklist = await http(app).get(`/upload/${novoToken}`).expect(200);
  expect(checklist.body.data.company).toBe('Padaria Central');
  await http(app).get(`/upload/${token}`).expect(404);
});

test('a falha do lembrete não some: fica failed com error e não conta como enviado', async () => {
  const { session } = await setup({ referenceMonth: '2026-07' });

  provider.breakChannel('provedor de email fora do ar');
  await ageMessages(4);
  // `sent` conta entrega, não tentativa: canal quebrado não pode reportar lembrete enviado
  expect((await runReminders(session.cookie)).sent).toBe(0);

  const [linha] = await reminders();
  expect(linha.status).toBe('failed');
  expect(linha.error).toContain('provedor de email fora do ar');

  provider.healChannel();
  const [pendente] = await db
    .select()
    .from(message)
    .where(and(eq(message.purpose, 'reminder'), eq(message.status, 'failed')));
  expect(pendente).toBeDefined();
});

test('lembrete que falhou NÃO deixa o Responsável sem link que funcione', async () => {
  const { session, token, request } = await setup({ referenceMonth: '2026-07' });
  const [antes] = await db.select().from(uploadLink).where(eq(uploadLink.requestId, request.id));

  provider.breakChannel('provedor de email fora do ar');
  await ageMessages(4);
  await runReminders(session.cookie);

  const [linha] = await reminders();
  expect(linha.status).toBe('failed');

  // A regra: canal quebrado não pode custar o acesso do Responsável. O Link não é
  // rotacionado quando o envio falha, então o token da abertura continua valendo.
  const [depois] = await db.select().from(uploadLink).where(eq(uploadLink.requestId, request.id));
  expect(depois.tokenHash).toBe(antes.tokenHash);
  await http(app).get(`/upload/${token}`).expect(200);
});

test('lembrete que falhou NÃO consome o teto de 2 cobranças', async () => {
  const { session } = await setup({ referenceMonth: '2026-07' });

  provider.breakChannel('provedor de email fora do ar');
  await ageMessages(4);
  await runReminders(session.cookie);

  provider.healChannel();
  await ageMessages(4);
  expect((await runReminders(session.cookie)).sent).toBe(1);

  await ageMessages(4);
  // O teto existe por custo de envio (domain.md, risco 2): envio que não saiu não custou,
  // então a Empresa ainda tem as duas cobranças a que o domínio dá direito.
  expect((await runReminders(session.cookie)).sent).toBe(1);

  await ageMessages(4);
  expect((await runReminders(session.cookie)).sent).toBe(0);
});
