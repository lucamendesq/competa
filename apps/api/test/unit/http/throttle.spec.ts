import { describe, expect, it } from 'vitest';
import {
  GLOBAL_BUCKETS,
  UPLOAD_PRESIGN_BUCKET,
  callerIp,
  makeThrottleStore,
  rateLimitHeaders,
  throttleKey,
  uploadTracker,
  type Bucket,
} from '../../../src/http/throttle.js';

const short = GLOBAL_BUCKETS[0];
const sustained = GLOBAL_BUCKETS[1];

const clock = (start = 0) => {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
};

describe('baldes', () => {
  it('reproduz os números do ThrottlerModule', () => {
    expect(short).toEqual({ name: 'short', limit: 30, ttlMs: 10_000 });
    expect(sustained).toEqual({ name: 'default', limit: 120, ttlMs: 60_000 });
    expect(UPLOAD_PRESIGN_BUCKET).toEqual({
      name: 'upload-presign',
      limit: 60,
      ttlMs: 60_000,
    });
  });
});

describe('makeThrottleStore', () => {
  const custom: Bucket = { name: 'default', limit: 3, ttlMs: 60_000 };

  it('libera até o limite e barra o excedente', () => {
    const store = makeThrottleStore(clock().now);

    for (let hit = 0; hit < 3; hit += 1) {
      expect(store.hit('k', custom).ok).toBe(true);
    }

    expect(store.hit('k', custom)).toEqual({ ok: false, retryAfterSec: 60 });
  });

  it('conta o restante da janela', () => {
    const store = makeThrottleStore(clock().now);

    expect(store.hit('k', custom)).toEqual({ ok: true, remaining: 2, resetSec: 60 });
    expect(store.hit('k', custom)).toEqual({ ok: true, remaining: 1, resetSec: 60 });
  });

  it('janela deslizante: hits saem da contagem ao expirar o ttl', () => {
    const time = clock();
    const store = makeThrottleStore(time.now);

    for (let hit = 0; hit < 3; hit += 1) store.hit('k', custom);
    time.advance(60_001);

    expect(store.hit('k', custom).ok).toBe(true);
  });

  it('enquanto bloqueado, hits não contam e o bloqueio não se estende', () => {
    const time = clock();
    const store = makeThrottleStore(time.now);

    for (let hit = 0; hit < 4; hit += 1) store.hit('k', custom);
    time.advance(30_000);

    expect(store.hit('k', custom)).toEqual({ ok: false, retryAfterSec: 30 });

    time.advance(30_001);
    expect(store.hit('k', custom).ok).toBe(true);
  });

  it('chaves distintas têm baldes independentes', () => {
    const store = makeThrottleStore(clock().now);

    for (let hit = 0; hit < 3; hit += 1) store.hit('a', custom);

    expect(store.hit('a', custom).ok).toBe(false);
    expect(store.hit('b', custom).ok).toBe(true);
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
    const first = throttleKey(
      'POST /upload/:token/documents',
      UPLOAD_PRESIGN_BUCKET,
      uploadTracker(ip, 't1'),
    );
    const second = throttleKey(
      'POST /upload/:token/documents',
      UPLOAD_PRESIGN_BUCKET,
      uploadTracker(ip, 't2'),
    );

    expect(first).toContain('1.1.1.1:t1');
    expect(first).not.toBe(second);
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
