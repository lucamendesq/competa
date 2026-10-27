import { Context, Effect, Exit, Layer, Option } from 'effect';
import { DbUnavailable, UniqueViolation, classify } from './error.js';
import { db as drizzleDb, pool } from './index.js';

type Drizzle = typeof drizzleDb;

/** Executor comum a `db.use` e às transações do drizzle. */
export type Executor = Omit<Drizzle, '$client'>;

/** A transação em que o trabalho corre, quando há uma. Como `Context.Reference` tem default,
 *  quem a LÊ nunca precisa declará-la como requisito — é isso que faz um repositório entrar
 *  na transação de quem o chamou sem receber parâmetro nenhum. */
const CurrentTransaction = Context.Reference<Option.Option<Executor>>(
  'competa/api/Db/CurrentTransaction',
  { defaultValue: () => Option.none() },
);

/** O callback do drizzle só desfaz a transação quando a promise REJEITA. Este sentinela
 *  carrega o Exit original através da rejeição, para ressurgir intacto do lado de fora. */
class Rollback {
  constructor(readonly exit: Exit.Exit<unknown, unknown>) {}
}

/** O pool do processo. Ele nasce no import de `./index.js` porque o better-auth também o usa;
 *  a layer decide quem o FECHA. */
export class DbPool extends Context.Service<DbPool, { readonly drizzle: Drizzle }>()(
  'competa/api/DbPool',
) {
  /** Dono do pool: `pool.end()` no fim do scope. Só um por processo — a API e os scripts. */
  static readonly layer = Layer.effect(
    DbPool,
    Effect.acquireRelease(
      Effect.sync(() => DbPool.of({ drizzle: drizzleDb })),
      () => Effect.promise(() => pool.end()).pipe(Effect.ignore),
    ),
  );

  /** Usa o pool sem fechá-lo: a suíte sobe dezenas de apps no mesmo processo, e a primeira a
   *  encerrar não pode levar o pool das seguintes. */
  static readonly layerBorrowed = Layer.succeed(DbPool, DbPool.of({ drizzle: drizzleDb }));
}

const make = (drizzle: Drizzle) => {
  const ambient = Effect.map(
    CurrentTransaction,
    Option.getOrElse((): Executor => drizzle),
  );

  const fromDriver = (error: unknown) => {
    const classified = classify(error);
    return classified === undefined ? Effect.die(error) : Effect.fail(classified);
  };

  const attempt = <A>(f: (d: Executor) => Promise<A>) =>
    Effect.flatMap(ambient, (d) =>
      Effect.tryPromise({ try: () => f(d), catch: (cause) => cause }).pipe(
        Effect.catch(fromDriver),
      ),
    );

  const use = <A>(f: (d: Executor) => Promise<A>) =>
    attempt(f).pipe(Effect.catchTag('UniqueViolation', (violation) => Effect.die(violation.cause)));

  const transact = <A, E, R>(
    parent: Executor,
    effect: Effect.Effect<A, E, R>,
    services: Context.Context<R>,
  ): Effect.Effect<A, E | DbUnavailable> =>
    Effect.callback<Exit.Exit<A, E>, DbUnavailable>((resume) => {
      const abort = new AbortController();
      const settled = parent
        .transaction(async (tx) => {
          const exit = await Effect.runPromiseExitWith(services)(
            Effect.provideService(effect, CurrentTransaction, Option.some(tx)),
            { signal: abort.signal },
          );

          if (Exit.isSuccess(exit)) return exit;
          throw new Rollback(exit);
        })
        .then(
          (exit) => {
            resume(Effect.succeed(exit));
          },
          (cause: unknown) => {
            resume(
              cause instanceof Rollback
                ? Effect.succeed(cause.exit as Exit.Exit<A, E>)
                : Effect.catchTag(fromDriver(cause), 'UniqueViolation', (violation) =>
                    Effect.die(violation.cause),
                  ),
            );
          },
        );

      /* Finalizer do `callback`, que só roda na interrupção e é esperado antes do fiber de
       * fora desenrolar: o abort derruba o fiber de dentro, o drizzle desfaz e só então
       * seguimos — nunca sobra meia transação commitada. */
      return Effect.promise(() => {
        abort.abort();
        return settled;
      });
    }).pipe(Effect.flatMap((exit) => exit));

  const withTransaction = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | DbUnavailable, R> =>
    Effect.flatMap(ambient, (parent) =>
      Effect.flatMap(Effect.context<R>(), (services) => transact(parent, effect, services)),
    );

  return { use, attempt, withTransaction };
};

/** Embrulha a instância de drizzle do processo — o pool continua sendo dela. */
export class Db extends Context.Service<
  Db,
  {
    /** Roda `f` no executor ambiente: a transação aberta, quando há uma; o pool, quando não.
     *  Banco fora do ar falha com `DbUnavailable`; qualquer outro erro do driver é defeito. */
    use<A>(f: (d: Executor) => Promise<A>): Effect.Effect<A, DbUnavailable>;
    /** Idem, com a violação de unicidade no canal, para quem a traduz em erro de domínio. */
    attempt<A>(f: (d: Executor) => Promise<A>): Effect.Effect<A, DbUnavailable | UniqueViolation>;
    /** Roda `effect` numa transação — num SAVEPOINT quando já existe uma aberta. Commita no
     *  sucesso; desfaz na falha, no defeito e na interrupção, preservando o Exit original. */
    withTransaction<A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ): Effect.Effect<A, E | DbUnavailable, R>;
  }
>()('competa/api/Db') {
  static readonly layerNoDeps = Layer.effect(
    Db,
    Effect.gen(function* () {
      const { drizzle } = yield* DbPool;
      return Db.of(make(drizzle));
    }),
  );

  static readonly layer = Db.layerNoDeps.pipe(Layer.provide(DbPool.layerBorrowed));

  /** Satisfaz o tipo sem abrir pool, e toda consulta MORRE. É trava, não dublê: quem diz não
   *  tocar o banco passa a PROVAR isso, e quebra alto no dia em que passar a tocar. A
   *  transação roda o corpo direto — se ele consultar, morre lá dentro do mesmo jeito. */
  static readonly layerTest = Layer.succeed(
    Db,
    Db.of({
      use: () => Effect.die(new Error('Db.layerTest: nenhuma consulta pode rodar')),
      attempt: () => Effect.die(new Error('Db.layerTest: nenhuma consulta pode rodar')),
      withTransaction: (effect) => effect,
    }),
  );
}
