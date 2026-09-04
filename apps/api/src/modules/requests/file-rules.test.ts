import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  MAX_FILE_BYTES,
  buildStorageKey,
  fileExtension,
  rejectionReason,
} from './file-rules.js';

const pdf = { fileName: 'Notas Fiscais.PDF', contentType: 'application/pdf', sizeBytes: 1024 };

test('extensão vem do nome do arquivo, com fallback no content-type', () => {
  assert.equal(fileExtension(pdf), 'pdf');
  assert.equal(fileExtension({ fileName: 'sem-extensao', contentType: 'application/zip' }), 'zip');
  assert.equal(fileExtension({ fileName: 'sem-extensao', contentType: 'inventado/x' }), undefined);
});

test('formato fora dos accepted_formats do Item é recusado', () => {
  assert.equal(rejectionReason(pdf, ['pdf', 'zip']), null);
  assert.match(rejectionReason(pdf, ['xml']) ?? '', /Formato \.pdf não aceito/);
});

test('zip é formato como qualquer outro (sem extração)', () => {
  const zip = { fileName: 'notas.zip', contentType: 'application/zip', sizeBytes: 10 };
  assert.equal(rejectionReason(zip, ['xml', 'zip']), null);
});

test('limite de 100 MB por arquivo', () => {
  assert.equal(rejectionReason({ ...pdf, sizeBytes: MAX_FILE_BYTES }, ['pdf']), null);
  assert.match(
    rejectionReason({ ...pdf, sizeBytes: MAX_FILE_BYTES + 1 }, ['pdf']) ?? '',
    /acima do limite de 100 MB/,
  );
});

test('Documento Extra aceita qualquer formato, mas respeita o tamanho', () => {
  assert.equal(rejectionReason({ ...pdf, fileName: 'qualquer.odt' }, null), null);
  assert.match(rejectionReason({ ...pdf, sizeBytes: MAX_FILE_BYTES + 1 }, null) ?? '', /limite/);
});

test('storage_key é escopado e ignora o nome enviado pelo Responsável', () => {
  assert.equal(
    buildStorageKey({
      accountingFirmId: 'firm-1',
      referenceMonth: '2026-08-01',
      requestId: 'req-1',
      documentId: 'doc-1',
      file: { fileName: '../../etc/passwd.pdf', contentType: 'application/pdf' },
    }),
    'firm/firm-1/period/2026-08-01/request/req-1/doc-1.pdf',
  );
});
