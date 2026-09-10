import assert from 'node:assert/strict';
import { test } from 'vitest';
import { isPushEndpoint } from '@contabilidade/contracts';

test('endpoint de push só passa se for de um serviço de push conhecido', () => {
  assert.equal(isPushEndpoint('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(isPushEndpoint('https://web.push.apple.com/abc'), true);

  // SSRF cego armazenado: rota anônima gravando uma URL que o servidor busca depois
  assert.equal(isPushEndpoint('http://169.254.169.254/latest/meta-data/'), false);
  assert.equal(isPushEndpoint('https://localhost:3000/interno'), false);
  assert.equal(isPushEndpoint('https://fcm.googleapis.com.atacante.com/x'), false);
  // sufixo confere mas o esquema não: http nunca é endpoint de push
  assert.equal(isPushEndpoint('http://web.push.apple.com/abc'), false);
  assert.equal(isPushEndpoint('nao-e-url'), false);
});
