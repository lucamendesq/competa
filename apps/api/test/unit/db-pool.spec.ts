import { Layer, ManagedRuntime } from 'effect';
import { describe, expect, it } from 'vitest';
import { Db, DbPool } from '../../src/infra/database/effect.js';
import { pool } from '../../src/infra/database/index.js';

describe('DbPool', () => {
  it('a layer emprestada não fecha o pool', async () => {
    const runtime = ManagedRuntime.make(Db.layer);
    await runtime.runPromise(Db.use((db) => db.use((d) => d.execute('select 1'))));
    await runtime.dispose();

    expect(pool.ended).toBe(false);
  });

  it('a layer dona fecha o pool no fim do scope', async () => {
    const runtime = ManagedRuntime.make(Db.layerNoDeps.pipe(Layer.provide(DbPool.layer)));
    await runtime.runPromise(Db.use((db) => db.use((d) => d.execute('select 1'))));
    await runtime.dispose();

    expect(pool.ended).toBe(true);
  });
});
