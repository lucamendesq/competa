import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { createTestApp, http } from '../../app.js';
import { resetDatabase } from '../../db.js';
import { createAccountantSession, createCompany, insertCompany, openPeriod } from '../../factories.js';
import {
  drainDeliveries,
  insertFailedMessage,
  itemNamed,
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
    missing: { id: string; name: string; status: string; dueDate: string | null }[];
    channelFailures: { channel: string; purpose: string; error: string | null }[];
  }[];
};

test('painel conta os Itens por estado em cada Empresa', async () => {
  const { cookie, requestId, period, token } = await setupReview(app, { dueDate: '2026-08-10' });

  const aceito = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: aceito.id });
  await http(app).post(`/request-items/${aceito.id}/accept`).set('cookie', cookie).expect(201);

  const enviado = await itemNamed(app, cookie, requestId, 'Extrato bancário');
  await uploadOk(app, token, { fileName: 'extrato.pdf', requestItemId: enviado.id });

  const [linha] = await panelOf(cookie, period.id);

  expect(linha.companyName).toBe('Padaria Central');
  expect(linha.counts).toEqual({ pending: 3, submitted: 1, accepted: 1, rejected: 0 });
});

test('missing traz só Item não aceito, com o prazo do Item ou o da Competência', async () => {
  const { cookie, requestId, period, token } = await setupReview(app, { dueDate: '2026-08-10' });

  const aceito = await itemNamed(app, cookie, requestId, 'DAS pago');
  await uploadOk(app, token, { fileName: 'das.pdf', requestItemId: aceito.id });
  await http(app).post(`/request-items/${aceito.id}/accept`).set('cookie', cookie).expect(201);

  const [linha] = await panelOf(cookie, period.id);

  expect(linha.missing.map((item) => item.name)).not.toContain('DAS pago');
  expect(linha.missing).toHaveLength(4);

  // prazo próprio do Item (congelado na abertura)
  const notas = linha.missing.find((item) => item.name === 'Notas fiscais emitidas')!;
  expect(notas.dueDate).toBe('2026-08-05');

  // Item sem prazo próprio herda o prazo geral da Competência
  const caixa = linha.missing.find((item) => item.name === 'Livro caixa')!;
  expect(caixa.dueDate).toBe('2026-08-10');
});

test('Item sem prazo próprio e Competência sem prazo geral aparece sem prazo', async () => {
  const { cookie, period } = await setupReview(app);

  const [linha] = await panelOf(cookie, period.id);
  const caixa = linha.missing.find((item) => item.name === 'Livro caixa')!;

  expect(caixa.dueDate).toBeNull();
});

test('Empresa sem Solicitação nesta Competência não aparece no painel', async () => {
  const { cookie, firm, period } = await setupReview(app);

  // cadastrada depois da abertura: não entrou no fan-out
  await createCompany(app, cookie, { name: 'Mercado Novo' });
  // ativa mas sem Responsável: o fan-out avisa e não cria Solicitação
  await insertCompany(firm.id, { name: 'Sem Responsável' });

  const linhas = await panelOf(cookie, period.id);

  expect(linhas).toHaveLength(1);
  expect(linhas.map((row) => row.companyName)).toEqual(['Padaria Central']);
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

  const [linha] = await panelOf(cookie, period.id);

  expect(linha.channelFailures).toHaveLength(1);
  expect(linha.channelFailures[0]).toMatchObject({
    channel: 'email',
    purpose: 'link_delivery',
    error: 'mailbox full',
  });
});
