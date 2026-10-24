import { Context, Effect, Layer, Schema } from 'effect';
import { db as drizzleDb } from './index.js';

type Drizzle = typeof drizzleDb;

/** Executor comum a `db.use` e às transações do drizzle (mesma forma do antigo `Database`). */
export type Executor = Omit<Drizzle, '$client'>;

export class DbError extends Schema.TaggedError<DbError>()('DbError', {
  cause: Schema.Defect(),
}) {}

/** Transição: embrulha a instância que a infra Nest já cria — o pool continua sendo dela.
 *  Na fase final a layer passa a possuir o pool via acquireRelease. `raw` existe para
 *  construir classes ainda não migradas (ex.: ChecklistRepository) e morre junto delas. */
export class Db extends Context.Service<
  Db,
  {
    readonly raw: Drizzle;
    use<A>(f: (d: Drizzle) => Promise<A>): Effect.Effect<A, DbError>;
  }
>()('competa/api/Db') {
  static readonly layer = Layer.sync(Db, () =>
    Db.of({
      raw: drizzleDb,
      use: (f) =>
        Effect.tryPromise({ try: () => f(drizzleDb), catch: (cause) => new DbError({ cause }) }),
    }),
  );
}
