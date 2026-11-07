import { layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Effect } from 'effect';
import { beforeAll, expect } from 'vitest';
import { ThrottleRepo } from '../../../src/http/throttle.repo.js';
import type { Bucket } from '../../../src/http/throttle.js';
import { throttleCounter } from '../../../src/infra/database/schema/index.js';
import { db, truncateAll } from '../../support/db.js';

const custom: Bucket = { name: 'default', limit: 3, ttlMs: 60_000 };
const short: Bucket = { name: 'short', limit: 30, ttlMs: 10_000 };

let seq = 0;
const key = () => `k${++seq}`;

const expire = (k: string) =>
  Effect.promise(() =>
    db
      .update(throttleCounter)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(throttleCounter.key, k)),
  );

layer(ThrottleRepo.layer)('ThrottleRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('libera até o limite e barra o excedente até o fim da janela', () =>
    Effect.gen(function* () {
      const repo = yield* ThrottleRepo;
      const k = key();

      const first = yield* repo.hit([{ key: k, bucket: custom }]);
      expect(first).toEqual([{ ok: true, remaining: 2, resetSec: 60 }]);
      yield* repo.hit([{ key: k, bucket: custom }]);
      yield* repo.hit([{ key: k, bucket: custom }]);

      const [blocked] = yield* repo.hit([{ key: k, bucket: custom }]);
      expect(blocked.ok).toBe(false);
      if (!blocked.ok) {
        expect(blocked.retryAfterSec).toBeGreaterThan(0);
        expect(blocked.retryAfterSec).toBeLessThanOrEqual(60);
      }
    }),
  );

  it.effect('janela vencida recomeça a contagem', () =>
    Effect.gen(function* () {
      const repo = yield* ThrottleRepo;
      const k = key();

      for (let hit = 0; hit < 4; hit += 1) yield* repo.hit([{ key: k, bucket: custom }]);
      yield* expire(k);

      expect(yield* repo.hit([{ key: k, bucket: custom }])).toEqual([
        { ok: true, remaining: 2, resetSec: 60 },
      ]);
    }),
  );

  it.effect('vários baldes num só round trip, cada um com a própria conta', () =>
    Effect.gen(function* () {
      const repo = yield* ThrottleRepo;
      const a = key();
      const b = key();

      yield* repo.hit([{ key: a, bucket: custom }]);
      const results = yield* repo.hit([
        { key: b, bucket: short },
        { key: a, bucket: custom },
      ]);

      expect(results).toEqual([
        { ok: true, remaining: 29, resetSec: 10 },
        { ok: true, remaining: 1, resetSec: 60 },
      ]);
    }),
  );

  it.effect('chaves distintas têm baldes independentes', () =>
    Effect.gen(function* () {
      const repo = yield* ThrottleRepo;
      const a = key();

      for (let hit = 0; hit < 3; hit += 1) yield* repo.hit([{ key: a, bucket: custom }]);

      expect((yield* repo.hit([{ key: a, bucket: custom }]))[0].ok).toBe(false);
      expect((yield* repo.hit([{ key: key(), bucket: custom }]))[0].ok).toBe(true);
    }),
  );

  it.effect('a faxina apaga só as janelas vencidas', () =>
    Effect.gen(function* () {
      const repo = yield* ThrottleRepo;
      const stale = key();
      const live = key();

      yield* repo.hit([{ key: stale, bucket: custom }]);
      yield* repo.hit([{ key: live, bucket: custom }]);
      yield* expire(stale);

      yield* repo.prune;

      const left = yield* Effect.promise(() =>
        db.select({ key: throttleCounter.key }).from(throttleCounter),
      );
      const keys = left.map((row) => row.key);
      expect(keys).toContain(live);
      expect(keys).not.toContain(stale);
    }),
  );
});
