import { expect, test } from 'vitest';
import { createToken, hashToken } from '../../../src/lib/token.js';

test('o token tem no mínimo 32 bytes de entropia em base64url', () => {
  const { token } = createToken();

  expect(Buffer.from(token, 'base64url')).toHaveLength(32);
  expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
});

test('cada chamada gera um token distinto', () => {
  const tokens = new Set(Array.from({ length: 200 }, () => createToken().token));

  expect(tokens.size).toBe(200);
});

test('o banco nunca vê o token: createToken devolve o hash correspondente', () => {
  const { token, tokenHash } = createToken();

  expect(tokenHash).toBe(hashToken(token));
  expect(tokenHash).not.toBe(token);
});

test('hashToken é sha256 estável: mesmo token, mesmo hash', () => {
  const { token } = createToken();

  expect(hashToken(token)).toBe(hashToken(token));
  expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
  expect(hashToken('a')).not.toBe(hashToken('b'));
});
