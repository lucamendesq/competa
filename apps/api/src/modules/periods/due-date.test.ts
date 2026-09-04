import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemDueDate } from './due-date.js';

test('sem due_day o Item herda o prazo da Competência', () => {
  assert.equal(itemDueDate('2026-08-01', null, 1), null);
});

test('due_month_offset 0 vence no próprio mês de referência', () => {
  assert.equal(itemDueDate('2026-08-01', 5, 0), '2026-08-05');
});

test('due_month_offset 1 vence no mês seguinte', () => {
  assert.equal(itemDueDate('2026-08-01', 20, 1), '2026-09-20');
});

test('offset atravessa a virada do ano', () => {
  assert.equal(itemDueDate('2026-12-01', 10, 1), '2027-01-10');
});

test('due_day além do fim do mês clampa para o último dia', () => {
  assert.equal(itemDueDate('2026-01-01', 31, 1), '2026-02-28');
  assert.equal(itemDueDate('2024-01-01', 31, 1), '2024-02-29');
  assert.equal(itemDueDate('2026-04-01', 31, 0), '2026-04-30');
});

test('due_month_offset nulo é tratado como o próprio mês', () => {
  assert.equal(itemDueDate('2026-08-01', 15, null), '2026-08-15');
});
