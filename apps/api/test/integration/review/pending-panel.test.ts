import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, http } from '../../app.js';
import { resetDatabase } from '../../db.js';
import {
  createAccountantSession,
  createCompany,
  insertCompany,
  openPeriod,
} from '../../factories.js';
import {
  drainDeliveries,
  insertFailedMessage,
  itemNamed,
  rejectDocument,
  resetRateLimit,
  setupReview,
  uploadOk,
} from './helpers.js';

/** Painel de Pendências: "quem faltou" por Empresa, com o prazo efetivo de cada Item que
 *  ainda não foi aceito e as falhas de canal daquela Competência. */

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

const panelOf = async (cookie: string, periodId: string) => {
  const response = await http(app)
    .get(`/periods/${periodId}/pending-panel`)
    .set('cookie', cookie)
    .expect(200);

  return response.body.data as {
    companyId: string;
    companyName: string;
    requestId: string;
    counts: { pending: number; submitted: number; accepted: number; rejected: number };
    missing: {
      id: string;
      name: string;
      status: string;
      resent: boolean;
      dueDate: string | null;
    }[];
    channelFailures: { channel: string; purpose: string; error: string | null }[];
  }[];
};

test('painel conta os Itens por estado em cada Empresa', async () => {
  const { cookie, requestId, period, token } = await setupReview(app, { dueDate: '2026-08-10' });

  const accepted = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: accepted.id });
  await http(app).post(`/request-items/${accepted.id}/accept`).set('cookie', cookie).expect(201);

  const sent = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  await uploadOk(app, token, { fileName: 'extrato.pdf', requestItemId: sent.id });

  const [row] = await panelOf(cookie, period.id);

  expect(row.companyName).toBe('Padaria Central');
  expect(row.counts).toEqual({ pending: 3, submitted: 1, accepted: 1, rejected: 0 });
});

test('missing traz só Item não aceito, com o prazo do Item ou o da Competência', async () => {
  const { cookie, requestId, period, token } = await setupReview(app, { dueDate: '2026-08-10' });

  const accepted = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: accepted.id });
  await http(app).post(`/request-items/${accepted.id}/accept`).set('cookie', cookie).expect(201);

  const [row] = await panelOf(cookie, period.id);

  expect(row.missing.map((item) => item.name)).not.toContain('DAS pago');
  expect(row.missing).toHaveLength(4);

  // prazo próprio do Item (congelado na abertura)
  const notas = row.missing.find((item) => item.name === 'Notas fiscais emitidas')!;
  expect(notas.dueDate).toBe('2026-08-05');

  // Item sem prazo próprio herda o prazo geral da Competência
  const inbox = row.missing.find((item) => item.name === 'Livro caixa')!;
  expect(inbox.dueDate).toBe('2026-08-10');
});

test('Item sem prazo próprio e Competência sem prazo geral aparece sem prazo', async () => {
  const { cookie, period } = await setupReview(app);

  const [row] = await panelOf(cookie, period.id);
  const inbox = row.missing.find((item) => item.name === 'Livro caixa')!;

  expect(inbox.dueDate).toBeNull();
});

test('Empresa sem Solicitação nesta Competência não aparece no painel', async () => {
  const { cookie, firm, period } = await setupReview(app);

  // cadastrada depois da abertura: não entrou no fan-out
  await createCompany(app, cookie, { name: 'Mercado Novo' });
  // ativa mas sem Responsável: o fan-out avisa e não cria Solicitação
  await insertCompany(firm.id, { name: 'Sem Responsável' });

  const lines = await panelOf(cookie, period.id);

  expect(lines).toHaveLength(1);
  expect(lines.map((row) => row.companyName)).toEqual(['Padaria Central']);
});

test('Competência sem nenhuma Solicitação devolve lista vazia, não erro', async () => {
  const session = await createAccountantSession(app);
  const period = await openPeriod(app, session.cookie, { referenceMonth: '2026-07' });

  expect(period.requests).toHaveLength(0);
  expect(await panelOf(session.cookie, period.id)).toEqual([]);
});

test('falha de canal da Competência aparece na linha da Empresa', async () => {
  const { cookie, requestId, period } = await setupReview(app);

  await insertFailedMessage(requestId, {
    purpose: 'link_delivery',
    recipient: 'quebrado@teste.com',
    error: 'mailbox full',
  });

  const [row] = await panelOf(cookie, period.id);

  expect(row.channelFailures).toHaveLength(1);
  expect(row.channelFailures[0]).toMatchObject({
    channel: 'email',
    purpose: 'link_delivery',
    error: 'mailbox full',
  });
});

/** A recusa devolve o Item para `pending` (é o que reabre o envio). No painel isso
 *  aparecia como "pendente" e a coluna `rejected` ficava eternamente em zero: o Contador
 *  não via a própria recusa. */
test('Item recusado aparece como rejeitado no painel, não como pendente', async () => {
  const { cookie, requestId, period, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
  });

  await rejectDocument(app, cookie, documentId, 'Extrato ilegível');

  const [row] = await panelOf(cookie, period.id);
  const refused = row.missing.find((row) => row.id === item.id)!;

  expect(refused.status).toBe('rejected');
  expect(row.counts.rejected).toBe(1);
});

test('reenvio depois da recusa devolve o Item para enviado no painel', async () => {
  const { cookie, requestId, period, token } = await setupReview(app);
  const item = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  const documentId = await uploadOk(app, token, {
    fileName: 'extrato.pdf',
    requestItemId: item.id,
  });

  const { token: newToken } = await rejectDocument(app, cookie, documentId, 'Extrato ilegível');
  await uploadOk(app, newToken!, { fileName: 'extrato-v2.pdf', requestItemId: item.id });

  const [row] = await panelOf(cookie, period.id);

  const resent = row.missing.find((row) => row.id === item.id)!;

  expect(resent.status).toBe('submitted');
  expect(resent.resent).toBe(true);
  expect(row.counts.rejected).toBe(0);
});
