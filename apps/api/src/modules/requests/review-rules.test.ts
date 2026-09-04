import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  acceptItemRefusal,
  missedDeadline,
  rejectDocumentRefusal,
  requestStatusAfterReview,
  summarizePending,
  type PanelRow,
} from './review-rules.js';

test('só Item submitted pode ser aceito', () => {
  assert.equal(acceptItemRefusal({ requestStatus: 'open', itemStatus: 'submitted' }), null);
  assert.match(
    acceptItemRefusal({ requestStatus: 'open', itemStatus: 'pending' }) ?? '',
    /ainda não tem documentos/,
  );
  assert.match(
    acceptItemRefusal({ requestStatus: 'open', itemStatus: 'accepted' }) ?? '',
    /já está aceito/,
  );
});

test('Solicitação encerrada não aceita mais revisão', () => {
  assert.match(
    acceptItemRefusal({ requestStatus: 'closed', itemStatus: 'submitted' }) ?? '',
    /encerrada/,
  );
  assert.match(
    rejectDocumentRefusal({
      requestStatus: 'closed',
      reviewStatus: 'pending',
      requestItemId: 'item',
    }) ?? '',
    /encerrada/,
  );
});

test('rejeição é por Documento de Item, e não repete estado final', () => {
  assert.equal(
    rejectDocumentRefusal({ requestStatus: 'open', reviewStatus: 'pending', requestItemId: 'i' }),
    null,
  );
  assert.match(
    rejectDocumentRefusal({
      requestStatus: 'open',
      reviewStatus: 'pending',
      requestItemId: null,
    }) ?? '',
    /Documento Extra/,
  );
  assert.match(
    rejectDocumentRefusal({
      requestStatus: 'open',
      reviewStatus: 'accepted',
      requestItemId: 'i',
    }) ?? '',
    /já foi aceito/,
  );
});

test('Solicitação vira complete sozinha e volta para open quando um Item reabre', () => {
  assert.equal(requestStatusAfterReview('open', ['accepted', 'accepted']), 'complete');
  assert.equal(requestStatusAfterReview('complete', ['accepted', 'pending']), 'open');
  assert.equal(requestStatusAfterReview('open', ['accepted', 'submitted']), 'open');
});

test('Solicitação sem itens nunca é complete; encerrada é palavra final', () => {
  assert.equal(requestStatusAfterReview('open', []), 'open');
  assert.equal(requestStatusAfterReview('closed', ['accepted']), 'closed');
});

test('prazo estourado: só item não entregue, com prazo efetivo já vencido', () => {
  const today = '2026-09-04';
  assert.equal(
    missedDeadline({ status: 'pending', dueDate: '2026-09-03', periodDueDate: null }, today),
    true,
  );
  assert.equal(
    missedDeadline({ status: 'rejected', dueDate: null, periodDueDate: '2026-09-01' }, today),
    true,
  );
  assert.equal(
    missedDeadline({ status: 'pending', dueDate: '2026-09-04', periodDueDate: null }, today),
    false,
  );
  assert.equal(
    missedDeadline({ status: 'submitted', dueDate: '2026-01-01', periodDueDate: null }, today),
    false,
  );
  assert.equal(
    missedDeadline({ status: 'pending', dueDate: null, periodDueDate: null }, today),
    false,
  );
});

test('prazo do Item ganha do prazo da Competência', () => {
  assert.equal(
    missedDeadline({ status: 'pending', dueDate: '2026-12-31', periodDueDate: '2026-01-01' }, '2026-09-04'),
    false,
  );
});

const row = (over: Partial<PanelRow>): PanelRow => ({
  companyId: 'c1',
  companyName: 'Mercado Central',
  requestId: 'r1',
  requestStatus: 'open',
  itemId: 'i1',
  itemName: 'Extrato bancário',
  itemStatus: 'pending',
  itemDueDate: null,
  periodDueDate: '2026-09-10',
  ...over,
});

test('quem faltou: contagem por estado e o que falta com prazo efetivo, por Empresa', () => {
  const panel = summarizePending([
    row({}),
    row({ itemId: 'i2', itemName: 'Notas fiscais', itemStatus: 'submitted', itemDueDate: '2026-09-05' }),
    row({ itemId: 'i3', itemName: 'Folha', itemStatus: 'accepted' }),
    row({ companyId: 'c2', companyName: 'Consultoria Alfa', requestId: 'r2', itemId: 'i4', itemName: 'Extrato bancário', itemStatus: 'rejected' }),
  ]);

  assert.deepEqual(panel.map((company) => company.companyName), [
    'Mercado Central',
    'Consultoria Alfa',
  ]);
  assert.deepEqual(panel[0].counts, { pending: 1, submitted: 1, accepted: 1, rejected: 0 });
  assert.deepEqual(panel[0].missing, [
    { id: 'i1', name: 'Extrato bancário', status: 'pending', dueDate: '2026-09-10' },
    { id: 'i2', name: 'Notas fiscais', status: 'submitted', dueDate: '2026-09-05' },
  ]);
  assert.deepEqual(panel[1].counts, { pending: 0, submitted: 0, accepted: 0, rejected: 1 });
});

test('Empresa com Solicitação sem itens aparece no painel sem pendência', () => {
  const panel = summarizePending([row({ itemId: null, itemName: null, itemStatus: null })]);

  assert.equal(panel.length, 1);
  assert.deepEqual(panel[0].missing, []);
});
