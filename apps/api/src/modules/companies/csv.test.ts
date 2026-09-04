import assert from 'node:assert/strict';
import { test } from 'vitest';
import { parseCsv, parseCsvRecords } from './csv.js';

test('CSV com aspas, vírgula dentro do campo e CRLF', () => {
  const rows = parseCsv('name,cnpj\r\n"Padaria, do João",11222333000144\r\n');

  assert.deepEqual(rows, [
    { line: 1, cells: ['name', 'cnpj'] },
    { line: 2, cells: ['Padaria, do João', '11222333000144'] },
  ]);
});

test('aspas escapadas e delimitador ; detectado pelo cabeçalho', () => {
  const rows = parseCsv('name;template\n"Bar ""do Zé""";Template MEI');

  assert.deepEqual(rows, [
    { line: 1, cells: ['name', 'template'] },
    { line: 2, cells: ['Bar "do Zé"', 'Template MEI'] },
  ]);
});

test('linha em branco no meio não desalinha o número de linha do relatório', () => {
  const records = parseCsvRecords(
    'Name,Contact Email,Flags\nAlfa,a@b.com,has_employees\n\nBeta,,\n',
  );

  assert.deepEqual(records, [
    { line: 2, values: { name: 'Alfa', contact_email: 'a@b.com', flags: 'has_employees' } },
    { line: 4, values: { name: 'Beta', contact_email: '', flags: '' } },
  ]);
});
