import assert from 'node:assert/strict';
import { recoveryFingerprint, signRecoveryToken, verifyRecoveryToken } from '../lib/token.js';

const links = [
  { requestId: 'r1', uploadLinkTokenHash: 'hash-a' },
  { requestId: 'r2', uploadLinkTokenHash: 'hash-b' },
];

const fingerprint = recoveryFingerprint(links);
const token = signRecoveryToken('Ze@Empresa.com', fingerprint, 60_000);

const confirmed = verifyRecoveryToken(token);
assert.ok(confirmed, 'token recém-assinado deve verificar');
assert.equal(confirmed.email, 'ze@empresa.com');
assert.equal(confirmed.fingerprint, fingerprint);

assert.equal(
  recoveryFingerprint([...links].reverse()),
  fingerprint,
  'fingerprint não pode depender da ordem das Solicitações',
);

const afterRotation = recoveryFingerprint([
  { requestId: 'r1', uploadLinkTokenHash: 'hash-novo' },
  { requestId: 'r2', uploadLinkTokenHash: 'hash-b' },
]);
assert.notEqual(afterRotation, confirmed.fingerprint, 'rotação precisa invalidar o replay');

assert.equal(verifyRecoveryToken(signRecoveryToken('a@b.com', fingerprint, -1)), null);
assert.equal(verifyRecoveryToken(`${token}x`), null, 'assinatura adulterada deve reprovar');
assert.equal(verifyRecoveryToken('a.b.c'), null, 'formato antigo de 3 partes deve reprovar');

console.log('check-recovery-token: ok');
