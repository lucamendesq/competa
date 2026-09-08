import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  GAP_DAYS_WITHOUT_DUE_DATE,
  MAX_REMINDERS_PER_REQUEST,
  nextDueDate,
  pickReminders,
  shouldRemind,
  type ReminderCandidate,
} from './reminder-rules.js';

const now = new Date('2026-09-10T09:00:00Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

const candidate = (overrides: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  requestId: 'r1',
  pendingItems: [{ name: 'Extrato bancário', dueDate: null }],
  periodDueDate: null,
  reminderCount: 0,
  lastMessageAt: daysAgo(GAP_DAYS_WITHOUT_DUE_DATE),
  ...overrides,
});

test('sem itens pendentes não recebe lembrete', () => {
  assert.equal(shouldRemind(candidate({ pendingItems: [] }), now), false);
});

test('cadência: no máximo 2 lembretes por Solicitação', () => {
  assert.equal(shouldRemind(candidate({ reminderCount: 1 }), now), true);
  assert.equal(shouldRemind(candidate({ reminderCount: MAX_REMINDERS_PER_REQUEST }), now), false);
  assert.equal(shouldRemind(candidate({ reminderCount: 5 }), now), false);
});

test('sem prazo: cadência semanal desde o envio anterior', () => {
  assert.equal(shouldRemind(candidate({ lastMessageAt: daysAgo(6) }), now), false);
  assert.equal(shouldRemind(candidate({ lastMessageAt: daysAgo(7) }), now), true);
  assert.equal(shouldRemind(candidate({ lastMessageAt: null }), now), true);
});

test('com prazo: só quando o prazo se aproxima (D-3) ou estourou', () => {
  const withDue = (dueDate: string) =>
    candidate({ pendingItems: [{ name: 'DAS', dueDate }], lastMessageAt: daysAgo(4) });

  assert.equal(shouldRemind(withDue('2026-09-20'), now), false);
  assert.equal(shouldRemind(withDue('2026-09-13'), now), true);
  assert.equal(shouldRemind(withDue('2026-09-05'), now), true);
});

test('com prazo respeita o intervalo mínimo de 3 dias entre lembretes', () => {
  const withDue = (lastMessageAt: Date) =>
    candidate({ pendingItems: [{ name: 'DAS', dueDate: '2026-09-10' }], lastMessageAt });

  assert.equal(shouldRemind(withDue(daysAgo(2)), now), false);
  assert.equal(shouldRemind(withDue(daysAgo(3)), now), true);
});

test('item sem prazo herda o prazo da Competência', () => {
  const inherited = candidate({
    pendingItems: [{ name: 'Extrato', dueDate: null }],
    periodDueDate: '2026-09-11',
    lastMessageAt: daysAgo(4),
  });

  assert.equal(nextDueDate(inherited), '2026-09-11');
  assert.equal(shouldRemind(inherited, now), true);
});

test('prazo da Solicitação é o mais próximo entre os itens pendentes', () => {
  const many = candidate({
    pendingItems: [
      { name: 'DAS', dueDate: '2026-09-25' },
      { name: 'Folha', dueDate: '2026-09-12' },
    ],
  });

  assert.equal(nextDueDate(many), '2026-09-12');
  assert.deepEqual(
    pickReminders([many, candidate({ requestId: 'r2', reminderCount: 2 })], now).map(
      (c) => c.requestId,
    ),
    ['r1'],
  );
});
