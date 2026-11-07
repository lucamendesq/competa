import { describe, expect, it } from 'vitest';
import {
  GLOBAL_BUCKETS,
  UPLOAD_PRESIGN_BUCKET,
  callerIp,
  rateLimitHeaders,
  throttleDefault,
  throttleKey,
  throttleResult,
  uploadTracker,
  type Bucket,
} from '../../../src/http/throttle.js';
import { createToken } from '../../../src/lib/token.js';

const short = GLOBAL_BUCKETS[0];
const sustained = GLOBAL_BUCKETS[1];

describe('baldes', () => {
  it('reproduz os números do ThrottlerModule', () => {
    expect(short).toEqual({ name: 'short', limit: 30, ttlMs: 10_000 });
    expect(sustained).toEqual({ name: 'default', limit: 120, ttlMs: 60_000 });
    expect(UPLOAD_PRESIGN_BUCKET).toEqual({
      name: 'upload-presign',
      limit: 60,
      ttlMs: 60_000,
      byToken: true,
    });
  });

  it('`@Throttle({default})` troca só o balde nomeado — o `short` sobrevive', () => {
    expect(throttleDefault(3, 60_000)).toEqual([
      { name: 'short', limit: 30, ttlMs: 10_000 },
      { name: 'default', limit: 3, ttlMs: 60_000 },
    ]);
    expect(GLOBAL_BUCKETS[1]).toEqual({ name: 'default', limit: 120, ttlMs: 60_000 });
  });
});

describe('throttleResult', () => {
  const custom: Bucket = { name: 'default', limit: 3, ttlMs: 60_000 };

  it('dentro do limite conta o restante e o fim da janela', () => {
    expect(throttleResult(custom, 1, 59.2)).toEqual({ ok: true, remaining: 2, resetSec: 60 });
    expect(throttleResult(custom, 3, 10)).toEqual({ ok: true, remaining: 0, resetSec: 10 });
  });

  it('acima do limite bloqueia pelo que falta da janela, nunca menos de 1s', () => {
    expect(throttleResult(custom, 4, 30.4)).toEqual({ ok: false, retryAfterSec: 31 });
    expect(throttleResult(custom, 4, 0.001)).toEqual({ ok: false, retryAfterSec: 1 });
  });
});

describe('throttleKey', () => {
  it('separa por rota, balde e cliente', () => {
    expect(throttleKey('POST /access/recover', sustained, '1.1.1.1')).toBe(
      'POST /access/recover:default:1.1.1.1',
    );
    expect(throttleKey('POST /access/recover', short, '1.1.1.1')).not.toBe(
      throttleKey('POST /access/recover', sustained, '1.1.1.1'),
    );
  });

  it('upload de presign é chaveado por ip:token — outro token no mesmo IP é outro balde', () => {
    const ip = '1.1.1.1';
    const t1 = createToken().token;
    const first = throttleKey(
      'POST /upload/:token/documents',
      UPLOAD_PRESIGN_BUCKET,
      uploadTracker(ip, t1),
    );
    const second = throttleKey(
      'POST /upload/:token/documents',
      UPLOAD_PRESIGN_BUCKET,
      uploadTracker(ip, createToken().token),
    );

    expect(first).toContain(`1.1.1.1:${t1}`);
    expect(first).not.toBe(second);
  });

  it('token sem a forma de um token emitido cai no balde do IP', () => {
    expect(uploadTracker('1.1.1.1', 'token-falso')).toBe('1.1.1.1');
    expect(uploadTracker('1.1.1.1', 'x'.repeat(1000))).toBe('1.1.1.1');
  });
});

describe('rateLimitHeaders', () => {
  it('o balde `default` não sufixa; os demais sufixam com o nome', () => {
    expect(rateLimitHeaders(sustained, { ok: true, remaining: 119, resetSec: 60 })).toEqual({
      'X-RateLimit-Limit': 120,
      'X-RateLimit-Remaining': 119,
      'X-RateLimit-Reset': 60,
    });
    expect(rateLimitHeaders(short, { ok: true, remaining: 29, resetSec: 10 })).toEqual({
      'X-RateLimit-Limit-short': 30,
      'X-RateLimit-Remaining-short': 29,
      'X-RateLimit-Reset-short': 10,
    });
  });

  it('bloqueado manda Retry-After com o mesmo sufixo', () => {
    expect(rateLimitHeaders(short, { ok: false, retryAfterSec: 7 })).toEqual({
      'Retry-After-short': 7,
    });
    expect(rateLimitHeaders(sustained, { ok: false, retryAfterSec: 7 })).toEqual({
      'Retry-After': 7,
    });
  });
});

describe('callerIp', () => {
  it('com trust proxy usa a entrada mais à DIREITA do x-forwarded-for', () => {
    expect(callerIp({ 'x-forwarded-for': '9.9.9.9, 10.0.0.1' }, '127.0.0.1', true)).toBe(
      '10.0.0.1',
    );
  });

  it('sem trust proxy ignora o header forjável', () => {
    expect(callerIp({ 'x-forwarded-for': '9.9.9.9' }, '127.0.0.1', false)).toBe('127.0.0.1');
  });

  it('sem header e sem endereço remoto cai em unknown', () => {
    expect(callerIp({}, undefined, true)).toBe('unknown');
  });
});
