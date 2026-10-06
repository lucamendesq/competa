/* Limites de upload nas bordas exatas (COM-151). Sem banco e sem arquivo de verdade: as
 * três camadas que impõem o teto são funções puras sobre o tamanho (declarado no presign e
 * real na confirmação), então a borda se exercita byte a byte em milissegundos — e não
 * depende de aba nem de concorrência, que foi o que atrapalhou a varredura do QA. */
import assert from 'node:assert/strict';
import {
  MAX_BYTES_PER_REQUEST,
  MAX_DOCS_PER_REQUEST,
  MAX_FILE_BYTES,
  confirmationRefusal,
  rejectionReason,
  requestCapRefusal,
} from '../modules/requests/file-rules.js';

const file = (sizeBytes: number, fileName = 'nota.pdf') => ({
  fileName,
  contentType: 'application/pdf',
  sizeBytes,
});

const accepts = (label: string, reason: string | null) => {
  assert.equal(reason, null, `${label} deveria passar, recusou com: ${reason}`);
  console.log(`  ✓ ${label}`);
};

const refuses = (label: string, reason: string | null) => {
  assert.notEqual(reason, null, `${label} deveria ser recusado`);
  console.log(`  ✓ ${label} → "${reason}"`);
};

console.log('--- COM-151: bordas exatas dos limites de upload ---\n');

console.log(`1. Por arquivo (MAX_FILE_BYTES = ${MAX_FILE_BYTES} bytes = 100 MiB)`);
accepts('exatamente 100 MiB', rejectionReason(file(MAX_FILE_BYTES), null));
refuses('100 MiB + 1 byte', rejectionReason(file(MAX_FILE_BYTES + 1), null));
accepts('1 byte', rejectionReason(file(1), null));
refuses('0 bytes', rejectionReason(file(0), null));
refuses('tamanho negativo', rejectionReason(file(-1), null));

console.log('\n2. Nome do arquivo (255 caracteres)');
accepts('255 caracteres', rejectionReason(file(1, `${'a'.repeat(251)}.pdf`), null));
refuses('256 caracteres', rejectionReason(file(1, `${'a'.repeat(252)}.pdf`), null));

console.log(
  `\n3. Total por Solicitação (MAX_BYTES_PER_REQUEST = ${MAX_BYTES_PER_REQUEST} = 500 MiB)`,
);
accepts(
  'soma dá exatamente 500 MiB',
  requestCapRefusal({ count: 1, bytes: MAX_BYTES_PER_REQUEST - 1 }, file(1)),
);
refuses(
  'soma passa 500 MiB por 1 byte',
  requestCapRefusal({ count: 1, bytes: MAX_BYTES_PER_REQUEST }, file(1)),
);
accepts(
  'Solicitação vazia + arquivo no limite',
  requestCapRefusal({ count: 0, bytes: 0 }, file(MAX_FILE_BYTES)),
);

console.log(`\n4. Quantidade por Solicitação (MAX_DOCS_PER_REQUEST = ${MAX_DOCS_PER_REQUEST})`);
accepts('documento 1000 (count = 999)', requestCapRefusal({ count: 999, bytes: 0 }, file(1)));
refuses('documento 1001 (count = 1000)', requestCapRefusal({ count: 1000, bytes: 0 }, file(1)));

console.log('\n5. Confirmação: tamanho real vs. declarado');
accepts(
  'real igual ao declarado, no limite',
  confirmationRefusal({
    fileName: 'nota.pdf',
    declaredBytes: MAX_FILE_BYTES,
    realBytes: MAX_FILE_BYTES,
  }),
);
refuses(
  'declarou 1 byte e subiu 100 MiB + 1',
  confirmationRefusal({ fileName: 'nota.pdf', declaredBytes: 1, realBytes: MAX_FILE_BYTES + 1 }),
);
refuses(
  'real diferente do declarado',
  confirmationRefusal({ fileName: 'nota.pdf', declaredBytes: 10, realBytes: 11 }),
);
refuses(
  'arquivo não chegou ao storage',
  confirmationRefusal({ fileName: 'nota.pdf', declaredBytes: 10, realBytes: undefined }),
);

console.log('\n6. Coerência entre os tetos');
assert.ok(
  MAX_BYTES_PER_REQUEST >= MAX_FILE_BYTES,
  'um arquivo no limite tem de caber numa Solicitação vazia',
);
console.log('  ✓ um arquivo de 100 MiB cabe numa Solicitação vazia');

console.log('\n--- COM-151: bordas verificadas ---');
