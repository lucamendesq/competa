/* O que o zip entrega depende de a coleta estar aberta ou fechada (COM-160). Verificação
 * pura: `zipEntries` não toca banco nem storage, então aqui não há fixture para limpar. */
import assert from 'node:assert/strict';
import { zipEntries, type ZipDocument } from '../modules/requests/zip.js';

const doc = (over: Partial<ZipDocument>): ZipDocument => ({
  storageKey: 'k',
  fileName: 'arquivo.pdf',
  itemName: 'Extrato bancário',
  companyName: 'Padaria do Zé',
  reviewStatus: 'accepted',
  requestStatus: 'open',
  ...over,
});

const open = [
  doc({ fileName: 'aceito.pdf' }),
  doc({ fileName: 'pendente.pdf', reviewStatus: 'pending' }),
  doc({ fileName: 'recusado.pdf', reviewStatus: 'rejected' }),
];
const closed = open.map((row) => doc({ ...row, requestStatus: 'closed' }));

assert.deepEqual(
  zipEntries(open, false).map((entry) => entry.path),
  ['Extrato bancário/aceito.pdf', 'Extrato bancário/pendente.pdf'],
  'coleta aberta entrega tudo que não foi recusado',
);
assert.deepEqual(
  zipEntries(closed, false).map((entry) => entry.path),
  ['Extrato bancário/aceito.pdf'],
  'coleta fechada entrega só o conferido',
);
assert.deepEqual(
  zipEntries(
    [...open, ...closed.map((row) => doc({ ...row, companyName: 'Mercado da Ana' }))],
    true,
  )
    .map((entry) => entry.path)
    .sort(),
  [
    'Mercado da Ana/Extrato bancário/aceito.pdf',
    'Padaria do Zé/Extrato bancário/aceito.pdf',
    'Padaria do Zé/Extrato bancário/pendente.pdf',
  ],
  'no zip da Competência a regra vale por Solicitação, não por Competência',
);
assert.deepEqual(
  zipEntries(
    [
      doc({ fileName: 'extra.pdf', itemName: null, reviewStatus: 'pending' }),
      doc({
        fileName: 'extra-fechado.pdf',
        itemName: null,
        reviewStatus: 'pending',
        requestStatus: 'closed',
      }),
    ],
    false,
  ).map((entry) => entry.path),
  ['Documentos Extra/extra.pdf'],
  'Documento Extra segue a mesma regra, na pasta dele',
);
assert.deepEqual(
  zipEntries([doc({}), doc({}), doc({})], false).map((entry) => entry.path),
  [
    'Extrato bancário/arquivo.pdf',
    'Extrato bancário/arquivo (2).pdf',
    'Extrato bancário/arquivo (3).pdf',
  ],
  'nome repetido continua ganhando sufixo',
);

console.log('verify-com-160: ok');
