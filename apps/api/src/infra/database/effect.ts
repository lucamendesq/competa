import { Context, Effect, Exit, Layer, Option } from 'effect';
import { DbError } from './error.js';
import { db as drizzleDb } from './index.js';

type Drizzle = typeof drizzleDb;

/** Executor comum a `db.use` e às transações do drizzle (mesma forma do antigo `Database`). */
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

const make = (drizzle: Drizzle) => {
  const ambient = Effect.map(
    CurrentTransaction,
    Option.getOrElse((): Executor => drizzle),
  );

  const attempt = <A>(f: (d: Executor) => Promise<A>) =>
    Effect.flatMap(ambient, (d) =>
      Effect.tryPromise({ try: () => f(d), catch: (cause) => new DbError({ cause }) }),
    );

  const use = <A>(f: (d: Executor) => Promise<A>) => Effect.orDie(attempt(f));

  const transact = <A, E, R>(
    parent: Executor,
    effect: Effect.Effect<A, E, R>,
    services: Context.Context<R>,
  ): Effect.Effect<A, E | DbError> =>
    Effect.callback<Exit.Exit<A, E>, DbError>((resume) => {
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
                : Effect.fail(new DbError({ cause })),
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

  const attemptTransaction = <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ): Effect.Effect<A, E | DbError, R> =>
    Effect.flatMap(ambient, (parent) =>
      Effect.flatMap(Effect.context<R>(), (services) => transact(parent, effect, services)),
    );

  /* Mata só o `DbError` da maquinaria, não o canal inteiro: o corpo da transação costuma ter
   * erro de domínio, que é justamente o que o chamador trata. */
  const withTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.catchTag(
      attemptTransaction(effect) as Effect.Effect<A, E | DbError, R>,
      'DbError',
      Effect.die,
    ) as Effect.Effect<A, E, R>;

  return { use, attempt, withTransaction, attemptTransaction };
};

/** Embrulha a instância de drizzle do processo — o pool continua sendo dela. */
export class Db extends Context.Service<
  Db,
  {
    /** Roda `f` no executor ambiente: a transação aberta, quando há uma; o pool, quando não.
     *  Erro de banco vira defeito, porque acima do repositório ninguém sabe tratá-lo. */
    use<A>(f: (d: Executor) => Promise<A>): Effect.Effect<A>;
    /** Para quem vai INSPECIONAR o erro do driver — violação de unicidade que vira erro de
     *  domínio, ou erro de domínio que atravessou a transação embrulhado. */
    attempt<A>(f: (d: Executor) => Promise<A>): Effect.Effect<A, DbError>;
    /** Roda `effect` numa transação — num SAVEPOINT quando já existe uma aberta. Commita no
     *  sucesso; desfaz na falha, no defeito e na interrupção, preservando o Exit original. */
    withTransaction<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R>;
    /** Idem, com o `DbError` da maquinaria (BEGIN/COMMIT caindo) no canal. Quem usa `attempt`
     *  no corpo precisa deste: `withTransaction` mataria os dois, que chegam com a mesma tag. */
    attemptTransaction<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | DbError, R>;
  }
>()('competa/api/Db') {
  static readonly layer = Layer.sync(Db, () => Db.of(make(drizzleDb)));

  /** Satisfaz o tipo sem abrir pool, e toda consulta MORRE. É trava, não dublê: quem diz não
   *  tocar o banco passa a PROVAR isso, e quebra alto no dia em que passar a tocar. As duas
   *  transações rodam o corpo direto — se ele consultar, morre lá dentro do mesmo jeito. */
  static readonly layerTest = Layer.succeed(
    Db,
    Db.of({
      use: () => Effect.die(new Error('Db.layerTest: nenhuma consulta pode rodar')),
      attempt: () => Effect.die(new Error('Db.layerTest: nenhuma consulta pode rodar')),
      withTransaction: (effect) => effect,
      attemptTransaction: (effect) => effect,
    }),
  );
}
