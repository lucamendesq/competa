import assert from 'node:assert/strict';
import { itemDueDate } from '../modules/periods/due-date.js';
import { planFanOut } from '../modules/periods/fan-out.js';
import { mergeEffectiveChecklist } from '../modules/checklists/effective-checklist.js';
import { requestStatusAfterReview } from '../modules/requests/review-rules.js';

const templateLine = (over: Record<string, unknown> = {}) => ({
  documentTypeId: 'dt-1',
  name: 'DAS',
  category: 'fiscal',
  description: null,
  acceptedFormats: ['pdf'],
  periodicity: 'annual' as const,
  annualMonth: 3,
  dueDay: 20,
  dueMonthOffset: 1,
  conditionFlag: null,
  required: true,
  ...over,
});

// 2026-03-20 cai numa sexta; 2026-02-21 cai num sábado → antecipa para 20/02.
assert.equal(itemDueDate('2026-02-01', 20, 1), '2026-03-20');
assert.equal(itemDueDate('2026-01-01', 21, 1), '2026-02-20');
// mês curto: dia 31 em fevereiro cai no último dia, e 28/02/2026 é sábado → 27.
assert.equal(itemDueDate('2026-01-01', 31, 1), '2026-02-27');
// sem dueDay não há prazo próprio; offset ausente usa 1, não 0.
assert.equal(itemDueDate('2026-01-01', null, 1), null);
assert.equal(itemDueDate('2026-01-01', 15, null), '2026-02-13');

// base − remoções + adições
const merged = mergeEffectiveChecklist(
  [templateLine(), templateLine({ documentTypeId: 'dt-2', name: 'Extrato' })],
  [
    {
      documentTypeId: 'dt-2',
      action: 'remove',
      name: 'Extrato',
      category: 'fiscal',
      description: null,
      acceptedFormats: [],
    },
  ],
);
assert.deepEqual(
  merged.map((line) => line.documentTypeId),
  ['dt-1'],
);

// `add` sobre item já no template herda o que o override não preenche
const [replaced] = mergeEffectiveChecklist(
  [templateLine()],
  [
    {
      documentTypeId: 'dt-1',
      action: 'add',
      name: 'DAS',
      category: 'fiscal',
      description: null,
      acceptedFormats: ['pdf'],
    },
  ],
);
assert.equal(replaced.source, 'override');
assert.equal(replaced.periodicity, 'annual');
assert.equal(replaced.dueDay, 20);

// Empresa sem template mas com override de adição entra no fan-out
const added = {
  documentTypeId: 'dt-9',
  action: 'add',
  name: 'Nota',
  category: 'fiscal',
  description: null,
  acceptedFormats: ['pdf'],
};
const lines = mergeEffectiveChecklist([], [added]).map((line) => ({ ...line, applies: true }));
const semTemplate = planFanOut({
  companies: [
    {
      id: 'c1',
      name: 'Alfa',
      checklistTemplateId: null,
      contactCount: 1,
      contact: { id: 'ct1', name: 'Ana', email: 'ana@x.com', phone: null },
    },
  ],
  checklistFor: () => lines,
  referenceMonth: '2026-02-01',
  expiresAt: new Date('2026-03-01'),
  createToken: () => ({ token: 't', tokenHash: 'h' }),
});
assert.equal(semTemplate.plans.length, 1);
assert.equal(semTemplate.warnings.length, 0);

// Empresa com template cujo checklist resolve para zero itens não recebe Solicitação
const semItens = planFanOut({
  companies: [
    {
      id: 'c2',
      name: 'Beta',
      checklistTemplateId: 'tpl',
      contactCount: 2,
      contact: { id: 'ct2', name: 'Bia', email: 'bia@x.com', phone: null },
    },
  ],
  checklistFor: () => [],
  referenceMonth: '2026-02-01',
  expiresAt: new Date('2026-03-01'),
  createToken: () => ({ token: 't', tokenHash: 'h' }),
});
assert.equal(semItens.plans.length, 0);
assert.equal(semItens.warnings[0].blockedBy, 'template');

// Mais de um Responsável: entra, mas avisa que só o primeiro recebe o link
const multi = planFanOut({
  companies: [
    {
      id: 'c3',
      name: 'Gama',
      checklistTemplateId: 'tpl',
      contactCount: 2,
      contact: { id: 'ct3', name: 'Caio', email: 'caio@x.com', phone: null },
    },
  ],
  checklistFor: () => lines,
  referenceMonth: '2026-02-01',
  expiresAt: new Date('2026-03-01'),
  createToken: () => ({ token: 't', tokenHash: 'h' }),
});
assert.equal(multi.plans.length, 1);
assert.match(multi.warnings[0].reason, /2 Responsáveis/);

// Item não obrigatório não segura o `complete`
assert.equal(
  requestStatusAfterReview('open', [
    { status: 'accepted', required: true },
    { status: 'pending', required: false },
  ]),
  'complete',
);
assert.equal(
  requestStatusAfterReview('open', [
    { status: 'accepted', required: true },
    { status: 'pending', required: true },
  ]),
  'open',
);

console.log('verify-qa-fixes: ok');
