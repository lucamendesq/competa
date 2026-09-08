import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { requestItem } from '../../../src/infra/database/schema/index.js';
import type { DeadlineMissedEvent } from '../../../src/lib/events.js';
import { createTestApp, http } from '../../app.js';
import { db, resetDatabase } from '../../db.js';
import {
  captureEvent,
  drainDeliveries,
  itemNamed,
  messagesOf,
  rejectDocument,
  resetRateLimit,
  setupReview,
  uploadOk,
  waitFor,
} from './helpers.js';

/** Varredura de prazo estourado. A idempotência é `request_item.deadline_notified_at`
 *  (marca no banco): avisar duas vezes é o defeito que assusta o cliente, e reiniciar a
 *  API não pode reavisar. Reabrir o Item limpa a marca de propósito. */

let app: INestApplication;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await drainDeliveries();
  await resetDatabase();
  resetRateLimit(app);
});

type ScanResult = {
  overdue: number;
  alreadyNotified: number;
  notified: { requestItemId: string; itemName: string; companyName: string; dueDate: string }[];
};

const scan = async (cookie: string) => {
  const response = await http(app).post('/deadlines/scan').set('cookie', cookie).expect(201);

  return response.body.data as ScanResult;
};

test('a varredura avisa uma vez por Item e a segunda varredura não reemite', async () => {
  const { cookie, requestId } = await setupReview(app, { dueDate: '2026-08-10' });

  const first = await scan(cookie);
  expect(first.notified).toHaveLength(5);
  expect(first.alreadyNotified).toBe(0);

  const flagged = await db.select().from(requestItem).where(eq(requestItem.requestId, requestId));
  expect(flagged.every((item) => item.deadlineNotifiedAt !== null)).toBe(true);

  const second = await scan(cookie);
  expect(second.notified).toHaveLength(0);
  expect(second.overdue).toBe(5);
  expect(second.alreadyNotified).toBe(5);

  // 5 itens × (Responsável + Contador), só da primeira varredura
  const warnings = await waitFor(
    () => messagesOf(requestId, 'deadline_missed'),
    (rows) => rows.length >= 10 && rows.every((row) => row.status !== 'queued'),
  );
  expect(warnings).toHaveLength(10);
});

test('reiniciar o processo não reavisa: a marca está no banco, não em memória', async () => {
  const { cookie } = await setupReview(app, { dueDate: '2026-08-10' });

  expect((await scan(cookie)).notified).toHaveLength(5);
  await drainDeliveries();

  // app nova, mesma porta: é o restart da API
  await app.close();
  app = await createTestApp();

  const afterRestart = await scan(cookie);
  expect(afterRestart.notified).toHaveLength(0);
  expect(afterRestart.alreadyNotified).toBe(5);
});

test('reabrir o Item limpa a marca e ele volta a ser elegível', async () => {
  const { cookie, requestId } = await setupReview(app, { dueDate: '2026-08-10' });
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');

  // a varredura rotaciona o token: o link que vale agora é o que foi avisado
  const notified = captureEvent<DeadlineMissedEvent>(app, 'DeadlineMissed');
  await scan(cookie);
  notified.stop();
  await drainDeliveries();

  const tokenAvisado = notified.seen[0].uploadUrl.split('/').pop()!;

  // entrega + rejeição: o Item volta para pending e a marca do cron é apagada
  const documentId = await uploadOk(app, tokenAvisado, {
    fileName: 'e.pdf',
    requestItemId: item.id,
  });
  const { response, token: freshToken } = await rejectDocument(app, cookie, documentId, 'Ilegível');
  expect(response.status).toBe(201);

  const [reaberto] = await db.select().from(requestItem).where(eq(requestItem.id, item.id));
  expect(reaberto.status).toBe('pending');
  expect(reaberto.deadlineNotifiedAt).toBeNull();

  const second = await scan(cookie);
  expect(second.notified.map((row) => row.requestItemId)).toEqual([item.id]);
  expect(freshToken).toBeTruthy();
});

test('Item sem prazo próprio e sem prazo da Competência nunca é elegível', async () => {
  const { cookie } = await setupReview(app);

  const result = await scan(cookie);

  expect(result.notified.map((row) => row.itemName)).not.toContain('Livro caixa');
  expect(result.notified).toHaveLength(4);
});

test('Competência encerrada fica fora da varredura', async () => {
  const { cookie, period } = await setupReview(app, { dueDate: '2026-08-10' });

  await http(app).post(`/periods/${period.id}/close`).set('cookie', cookie).expect(201);

  expect(await scan(cookie)).toMatchObject({ overdue: 0, notified: [] });
});

test('Solicitação encerrada fica fora da varredura', async () => {
  const { cookie, requestId } = await setupReview(app, { dueDate: '2026-08-10' });

  await http(app).post(`/requests/${requestId}/close`).set('cookie', cookie).expect(201);

  expect(await scan(cookie)).toMatchObject({ overdue: 0, notified: [] });
});

test('a varredura pela rota só vê a Contabilidade da sessão', async () => {
  const a = await setupReview(app, {
    firmName: 'Contabilidade A',
    companyName: 'Empresa A',
    dueDate: '2026-08-10',
  });
  const b = await setupReview(app, {
    firmName: 'Contabilidade B',
    companyName: 'Empresa B',
    dueDate: '2026-08-10',
  });

  const ofA = await scan(a.cookie);
  expect(new Set(ofA.notified.map((row) => row.companyName))).toEqual(new Set(['Empresa A']));

  const ofB = await scan(b.cookie);
  expect(new Set(ofB.notified.map((row) => row.companyName))).toEqual(new Set(['Empresa B']));

  const itemsOfB = await db
    .select()
    .from(requestItem)
    .where(eq(requestItem.requestId, b.requestId));
  expect(itemsOfB.every((item) => item.deadlineNotifiedAt !== null)).toBe(true);
});

test('o evento carrega os emails dos Contadores e um link de upload novo e válido', async () => {
  const { cookie, session, token } = await setupReview(app, { dueDate: '2026-08-10' });
  const captured = captureEvent<DeadlineMissedEvent>(app, 'DeadlineMissed');

  try {
    await scan(cookie);
  } finally {
    captured.stop();
  }

  expect(captured.seen).toHaveLength(5);

  const [evento] = captured.seen;
  expect(evento.accountantEmails).toEqual([session.email]);
  expect(evento.contactEmail).toContain('@');
  expect(evento.dueDate).toMatch(/^2026-08-\d{2}$/);

  // um token por Solicitação por varredura, e ele é o que vale agora
  const tokens = new Set(captured.seen.map((row) => row.uploadUrl.split('/').pop()));
  expect(tokens.size).toBe(1);

  const fresh = [...tokens][0]!;
  expect(fresh).not.toBe(token);
  await http(app).get(`/upload/${fresh}`).expect(200);
  await http(app).get(`/upload/${token}`).expect(404);
});
