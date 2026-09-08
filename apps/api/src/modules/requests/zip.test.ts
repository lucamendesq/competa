import assert from 'node:assert/strict';
import { test } from 'vitest';
import { zipEntries, zipFileName, type ZipDocument } from './zip.js';

const doc = (over: Partial<ZipDocument> = {}): ZipDocument => ({
  storageKey: 'k',
  fileName: 'extrato.pdf',
  itemName: 'Extrato bancário',
  companyName: 'Mercado Central',
  reviewStatus: 'accepted',
  ...over,
});

test('agrupa por Item e, no zip da Competência, também por Empresa', () => {
  const docs = [doc(), doc({ companyName: 'Consultoria Alfa', itemName: 'Livro caixa' })];

  assert.deepEqual(
    zipEntries(docs, false).map((e) => e.path),
    ['Extrato bancário/extrato.pdf', 'Livro caixa/extrato.pdf'],
  );
  assert.deepEqual(
    zipEntries(docs, true).map((e) => e.path),
    ['Mercado Central/Extrato bancário/extrato.pdf', 'Consultoria Alfa/Livro caixa/extrato.pdf'],
  );
});

test('Documento Extra vai para pasta própria e rejeitado fica fora da entrega', () => {
  const entries = zipEntries(
    [doc({ itemName: null, fileName: 'observacao.docx' }), doc({ reviewStatus: 'rejected' })],
    false,
  );

  assert.deepEqual(
    entries.map((e) => e.path),
    ['Documentos Extra/observacao.docx'],
  );
});

test('nome repetido no mesmo Item não sobrescreve', () => {
  const entries = zipEntries(
    [doc({ storageKey: 'a' }), doc({ storageKey: 'b' }), doc({ storageKey: 'c' })],
    false,
  );

  assert.deepEqual(
    entries.map((e) => e.path),
    [
      'Extrato bancário/extrato.pdf',
      'Extrato bancário/extrato (2).pdf',
      'Extrato bancário/extrato (3).pdf',
    ],
  );
});

test('caractere ilegal e travessia de caminho não escapam da pasta do Item', () => {
  const [entry] = zipEntries(
    [doc({ itemName: 'Guia ICMS / ICMS-ST', fileName: '../../etc/passwd' })],
    false,
  );

  assert.equal(entry.path, 'Guia ICMS - ICMS-ST/..-..-etc-passwd');
});

test('nome do arquivo baixado sem acento nem espaço', () => {
  assert.equal(
    zipFileName('Consultoria Alfa Ltda.', '2026-10-01'),
    'consultoria-alfa-ltda-2026-10.zip',
  );
  assert.equal(zipFileName('Competência 2026-10', '2026-10-01'), 'competencia-2026-10-2026-10.zip');
});
