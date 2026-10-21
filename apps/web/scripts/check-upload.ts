import assert from 'node:assert/strict';
import { ApiError } from '../src/api/error.js';
import { isBusy, trackBusy } from '../src/api/busy.js';
import { useUpload } from '../src/composables/useUpload.js';

const file = (name: string) => ({ name, size: 10, type: 'image/png' }) as File;

const failingPresign = useUpload({
  presign: () => {
    throw new ApiError(
      422,
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Dados inválidos.',
          details: [{ path: [], message: 'Informe a Solicitação (requestId) do envio.' }],
        },
      },
      'API Error 422',
    );
  },
  send: async () => undefined,
  confirm: async () => ({ refused: [] }),
});

const failed = await failingPresign.uploadFiles([file('nota.png')]);

assert.equal(failed.length, 1);
assert.equal(failed[0].fileName, 'nota.png');
assert.equal(failed[0].reason, 'Não foi possível concluir o envio. Tente de novo.');
assert.equal(failed[0].retriable, true);
assert.ok(failed[0].file, 'arquivo preservado para a nova tentativa');

const confirmed: string[][] = [];
const happy = useUpload({
  presign: async (files) => ({
    files: files.map((f, index) => ({
      fileName: f.fileName,
      accepted: true as const,
      documentId: `doc-${index}`,
      uploadUrl: `https://storage.local/doc-${index}`,
    })),
  }),
  send: async () => undefined,
  confirm: async (ids) => {
    confirmed.push(ids);
    return { refused: [] };
  },
});

const sent = await happy.uploadFiles([file('balancete.pdf')]);
assert.deepEqual(confirmed, [['doc-0']]);
assert.equal(sent[0].ok, true);

assert.equal(isBusy.value, false);
let peek = false;
await trackBusy(async () => {
  peek = isBusy.value;
});
assert.equal(peek, true, 'botões travam enquanto a escrita está em voo');
assert.equal(isBusy.value, false, 'e destravam quando ela termina');

console.log('check-upload: ok');
