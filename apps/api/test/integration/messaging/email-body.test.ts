import { expect, test } from 'vitest';
import type {
  DeadlineMissedEvent,
  InviteCreatedEvent,
  ItemReopenedEvent,
  RequestCompletedEvent,
  RequestCreatedEvent,
} from '../../../src/lib/events.js';
import {
  deadlineMissedAccountantEmail,
  deadlineMissedContactEmail,
  inviteEmail,
  itemReopenedEmail,
  linkDeliveryEmail,
  reminderEmail,
  requestCompletedEmail,
} from '../../../src/modules/messaging/email-body.js';

/** Corpos de email são funções puras: aqui se prova o que o cliente lê — quem tem link,
 *  quem NÃO tem, e o formato brasileiro de mês e data. */

const LINK = 'http://localhost:4200/envio/token-em-claro';

const created: RequestCreatedEvent = {
  requestId: 'r1',
  periodId: 'p1',
  referenceMonth: '2026-07-01',
  periodDueDate: '2026-08-10',
  companyId: 'c1',
  companyName: 'Padaria Central',
  contactId: 'ct1',
  contactName: 'Maria',
  contactEmail: 'maria@teste.com',
  contactPhone: null,
  uploadUrl: LINK,
  itemCount: 3,
};

test('entrega do Link: mês em MM/AAAA, prazo em DD/MM/AAAA e o link clicável', () => {
  const { subject, body } = linkDeliveryEmail(created);

  expect(subject).toContain('07/2026');
  expect(subject).toContain('Padaria Central');
  expect(body).toContain('10/08/2026');
  expect(body).toContain(`<a href="${LINK}">${LINK}</a>`);
  expect(body).toContain('3 documento(s)');
  expect(body).not.toContain('2026-07');
});

test('entrega do Link sem prazo na Competência não imprime "Prazo:"', () => {
  const { body } = linkDeliveryEmail({ ...created, periodDueDate: null });

  expect(body).not.toContain('Prazo:');
  expect(body).toContain(LINK);
});

test('lembrete agrupa os itens pendentes, cada um com o prazo que vale', () => {
  const { subject, body } = reminderEmail({
    requestId: 'r1',
    pendingItems: [
      { name: 'DAS pago', dueDate: '2026-08-20' },
      { name: 'Extrato bancário', dueDate: null },
    ],
    periodDueDate: '2026-08-10',
    reminderCount: 0,
    lastMessageAt: null,
    companyName: 'Padaria Central',
    contactName: 'Maria',
    referenceMonth: '2026-07-01',
    uploadUrl: LINK,
  });

  expect(subject).toContain('07/2026');
  expect(body).toContain('2 documento(s)');
  expect(body).toContain('<li>DAS pago — até 20/08/2026</li>');
  // item sem prazo próprio herda o prazo da Competência
  expect(body).toContain('<li>Extrato bancário — até 10/08/2026</li>');
  // "Prazo:" do lembrete é o mais próximo entre os pendentes
  expect(body).toContain('Prazo: <b>10/08/2026</b>');
  expect(body).toContain(LINK);
  expect(body).toContain('Este link substitui os anteriores.');
});

test('lembrete sem prazo algum não imprime "Prazo:" nem "até"', () => {
  const { body } = reminderEmail({
    requestId: 'r1',
    pendingItems: [{ name: 'Extrato bancário', dueDate: null }],
    periodDueDate: null,
    reminderCount: 1,
    lastMessageAt: null,
    companyName: 'Padaria Central',
    contactName: 'Maria',
    referenceMonth: '2026-07-01',
    uploadUrl: LINK,
  });

  expect(body).not.toContain('Prazo:');
  expect(body).not.toContain('até');
  expect(body).toContain('<li>Extrato bancário</li>');
});

test('lembrete sem rotação de link cai no texto genérico, nunca num link morto', () => {
  const { body } = reminderEmail({
    requestId: 'r1',
    pendingItems: [{ name: 'Extrato bancário', dueDate: null }],
    periodDueDate: null,
    reminderCount: 0,
    lastMessageAt: null,
    companyName: 'Padaria Central',
    contactName: 'Maria',
    referenceMonth: '2026-07-01',
  });

  expect(body).not.toContain('<a href');
  expect(body).toContain('Link de Upload que você já recebeu');
});

const reopened: ItemReopenedEvent = {
  requestId: 'r1',
  requestItemId: 'i1',
  itemName: 'Extrato bancário',
  rejectionReason: 'Página faltando',
  companyName: 'Padaria Central',
  contactName: 'Maria',
  contactEmail: 'maria@teste.com',
  uploadUrl: LINK,
};

test('reabertura leva o motivo e o link novo, avisando que o anterior morreu', () => {
  const { subject, body } = itemReopenedEmail(reopened);

  expect(subject).toContain('Extrato bancário');
  expect(body).toContain('Motivo: Página faltando');
  expect(body).toContain(`<a href="${LINK}">${LINK}</a>`);
  expect(body).toContain('o anterior deixou de valer');
});

test('reabertura sem motivo não imprime linha de motivo vazia', () => {
  const { body } = itemReopenedEmail({ ...reopened, rejectionReason: null });

  expect(body).not.toContain('Motivo:');
});

test('conclusão não leva link: não há mais nada a enviar', () => {
  const completed: RequestCompletedEvent = {
    requestId: 'r1',
    companyName: 'Padaria Central',
    contactName: 'Maria',
    contactEmail: 'maria@teste.com',
  };
  const { subject, body } = requestCompletedEmail(completed);

  expect(subject).toContain('Documentos recebidos');
  expect(body).not.toContain('<a href');
});

const missed: DeadlineMissedEvent = {
  requestId: 'r1',
  requestItemId: 'i1',
  itemName: 'DAS pago',
  dueDate: '2026-08-20',
  companyName: 'Padaria Central',
  contactName: 'Maria',
  contactEmail: 'maria@teste.com',
  uploadUrl: LINK,
  accountantEmails: ['contador@teste.com'],
};

test('prazo estourado do Responsável leva o link e a data em DD/MM/AAAA', () => {
  const { body } = deadlineMissedContactEmail(missed);

  expect(body).toContain('20/08/2026');
  expect(body).toContain(`<a href="${LINK}">${LINK}</a>`);
});

test('prazo estourado do Contador NÃO leva link de envio — o link é do Responsável', () => {
  const { subject, body } = deadlineMissedAccountantEmail(missed);

  expect(subject).toContain('Padaria Central');
  expect(body).toContain('20/08/2026');
  expect(body).toContain('maria@teste.com');
  expect(body).not.toContain('<a href');
  expect(body).not.toContain(LINK);
});

test('convite leva o link do convite e a data de expiração em DD/MM/AAAA', () => {
  const invite: InviteCreatedEvent = {
    email: 'novo@teste.com',
    firmName: 'Contabilidade Teste',
    inviteUrl: 'http://localhost:4200/convite/token',
    expiresAt: new Date('2026-09-11T12:00:00Z'),
  };
  const { subject, body } = inviteEmail(invite);

  expect(subject).toContain('Contabilidade Teste');
  expect(body).toContain('11/09/2026');
  expect(body).toContain('<a href="http://localhost:4200/convite/token">');
});

/** Nome e empresa vêm de dado do usuário (formulário, CSV) e vão para dentro de HTML:
 *  têm que ser escapados. Acento é preservado (não é caractere de markup); `<`, `>` e `&`
 *  viram entidade, então markup vindo do dado não é interpretado no email do Responsável. */
test('nome e empresa com HTML são escapados, e o acento é preservado', () => {
  const { body } = linkDeliveryEmail({
    ...created,
    contactName: 'José <b>Antônio</b> & Cia',
    companyName: 'Ação & Cia <script>',
  });

  expect(body).toContain('José');
  expect(body).toContain('Antônio');
  expect(body).toContain('Ação &amp; Cia');
  // o markup do dado não sobrevive como markup
  expect(body).toContain('&lt;b&gt;');
  expect(body).toContain('&lt;script&gt;');
  expect(body).not.toContain('<script>');
  expect(body).not.toContain('<b>Antônio</b>');
  // a estrutura do email (link e prazo) continua inteira
  expect(body).toContain(`<a href="${LINK}">${LINK}</a>`);
  expect(body).toContain('Prazo: <b>10/08/2026</b>');
});
