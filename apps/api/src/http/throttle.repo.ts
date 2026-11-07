import { lt, sql } from 'drizzle-orm';
import { Context, Effect, Layer } from 'effect';
import { Db } from '../infra/database/effect.js';
import { throttleCounter } from '../infra/database/schema/index.js';
import { throttleResult, type Bucket } from './throttle.js';

const PRUNE_EVERY_MS = 60_000;

const make = Effect.gen(function* () {
  const db = yield* Db;
  let lastPrune = 0;

  const prune = db
    .use((d) => d.delete(throttleCounter).where(lt(throttleCounter.expiresAt, sql`now()`)))
    .pipe(Effect.asVoid);

  const pruneEveryMinute = Effect.suspend(() => {
    if (Date.now() - lastPrune < PRUNE_EVERY_MS) return Effect.void;
    lastPrune = Date.now();
    return Effect.ignore(prune);
  });

  /** Uma batida em cada balde, num statement só. O relógio é o do banco: as instâncias
   *  divergem alguns milissegundos e a janela tem de ser a mesma para todas. */
  const hit = (hits: readonly { readonly key: string; readonly bucket: Bucket }[]) =>
    Effect.gen(function* () {
      if (hits.length === 0) return [];

      const rows = yield* db.use((d) =>
        d
          .insert(throttleCounter)
          .values(
            hits.map(({ key, bucket }) => ({
              key,
              hits: 1,
              expiresAt: sql`now() + make_interval(secs => ${bucket.ttlMs / 1000})`,
            })),
          )
          .onConflictDoUpdate({
            target: throttleCounter.key,
            set: {
              hits: sql`case when ${throttleCounter.expiresAt} <= now() then 1 else ${throttleCounter.hits} + 1 end`,
              expiresAt: sql`case when ${throttleCounter.expiresAt} <= now() then excluded.expires_at else ${throttleCounter.expiresAt} end`,
            },
          })
          .returning({
            key: throttleCounter.key,
            hits: throttleCounter.hits,
            secondsLeft: sql<number>`extract(epoch from ${throttleCounter.expiresAt} - now())::float8`,
          }),
      );
      yield* pruneEveryMinute;

      const byKey = new Map(rows.map((row) => [row.key, row]));
      return hits.map(({ key, bucket }) => {
        const row = byKey.get(key)!;
        return throttleResult(bucket, row.hits, row.secondsLeft);
      });
    });

  return { hit, prune };
});

export class ThrottleRepo extends Context.Service<ThrottleRepo, Effect.Success<typeof make>>()(
  'competa/api/http/ThrottleRepo',
) {
  static readonly layerNoDeps = Layer.effect(ThrottleRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
