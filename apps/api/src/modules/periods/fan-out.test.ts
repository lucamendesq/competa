import assert from 'node:assert/strict';
import { test } from 'vitest';
import { planFanOut } from './fan-out.js';

const line = (over: Record<string, unknown> = {}) => ({
  documentTypeId: 'dt',
  name: 'Doc',
  description: null,
  acceptedFormats: ['pdf'],
  periodicity: 'monthly',
  annualMonth: null,
  dueDay: null,
  dueMonthOffset: 1,
  applies: true,
  ...over,
});

const plan = (companies: any[], lines: any[], referenceMonth = '2026-08-01') =>
  planFanOut({
    companies,
    checklistFor: () => lines,
    referenceMonth,
    expiresAt: new Date('2026-10-01T00:00:00Z'),
    createToken: () => ({ token: 'claro', tokenHash: 'hash' }),
  });

test('Empresa ativa sem Responsável não gera Solicitação, vira aviso', () => {
  const { plans, warnings } = plan(
    [
      { id: 'a', name: 'Com Responsável', contact: { id: 'c1' } },
      { id: 'b', name: 'Sem Responsável' },
    ],
    [line()],
  );

  assert.deepEqual(
    plans.map((p) => p.companyId),
    ['a'],
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].companyId, 'b');
});

test('on_demand nunca entra; annual só na competência do annual_month', () => {
  const lines = [
    line({ documentTypeId: 'mensal' }),
    line({ documentTypeId: 'sob-demanda', periodicity: 'on_demand' }),
    line({ documentTypeId: 'anual', periodicity: 'annual', annualMonth: 12 }),
  ];
  const companies = [{ id: 'a', name: 'A', contact: { id: 'c1' } }];

  assert.deepEqual(
    plan(companies, lines, '2026-08-01').plans[0].items.map((i) => i.documentTypeId),
    ['mensal'],
  );
  assert.deepEqual(
    plan(companies, lines, '2026-12-01').plans[0].items.map((i) => i.documentTypeId),
    ['mensal', 'anual'],
  );
});

test('item que não se aplica à Empresa (condition_flag) fica fora do snapshot', () => {
  const { plans } = plan(
    [{ id: 'a', name: 'A', contact: { id: 'c1' } }],
    [line({ documentTypeId: 'folha', applies: false }), line({ documentTypeId: 'extrato' })],
  );

  assert.deepEqual(
    plans[0].items.map((i) => i.documentTypeId),
    ['extrato'],
  );
});

test('prazo congelado por item: offset 0 no mês de referência, 1 no seguinte', () => {
  const { plans } = plan(
    [{ id: 'a', name: 'A', contact: { id: 'c1' } }],
    [
      line({ documentTypeId: 'folha', dueDay: 25, dueMonthOffset: 0 }),
      line({ documentTypeId: 'extrato', dueDay: 5, dueMonthOffset: 1 }),
      line({ documentTypeId: 'sem-prazo' }),
    ],
  );

  assert.deepEqual(
    plans[0].items.map((i) => i.dueDate),
    ['2026-08-25', '2026-09-05', null],
  );
});
