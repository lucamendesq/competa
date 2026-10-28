import { Context, Duration, Effect, FiberSet, Layer } from 'effect';
import { EventEmitter2 } from './event-emitter.js';
import type { EventPayloads } from './events.js';

type Name = keyof EventPayloads;

/** Como um listener roda um Effect: numa fibra do app, não num runtime à parte — o shutdown
 *  espera por ela e, passado o prazo, a interrompe. */
export type RunListener<R> = <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>;

/** Quanto o shutdown espera listeners em voo (um email saindo) antes de interrompê-los. */
const DRAIN_TIMEOUT = Duration.seconds(5);

/**
 * O barramento de eventos de domínio. Por baixo é o eventemitter2 de sempre, porque o
 * observável depende dele: a ordem de registro dos listeners e o array de resultados do
 * `emitAsync` (o reenvio de link lê `includes(true)` para escolher entre 200 e 503).
 */
export class Events extends Context.Service<
  Events,
  {
    emit<N extends Name>(name: N, payload: EventPayloads[N]): Effect.Effect<void>;
    emitAsync<N extends Name>(name: N, payload: EventPayloads[N]): Effect.Effect<unknown[]>;
    /** Espera os listeners em voo. Para quem precisa afirmar que algo NÃO aconteceu. */
    readonly drain: Effect.Effect<void>;
  }
>()('competa/api/Events') {
  static readonly make = <R>(register: (emitter: EventEmitter2, run: RunListener<R>) => void) =>
    Layer.effect(
      Events,
      Effect.gen(function* () {
        const emitter = new EventEmitter2();
        /* Finalizadores rodam do último para o primeiro: para de aceitar evento, espera os
         * listeners em voo, e só então o FiberSet interrompe o que sobrou. */
        const listeners = yield* FiberSet.make();
        const run = yield* FiberSet.runtimePromise(listeners)<R>();
        const drain = FiberSet.awaitEmpty(listeners);

        yield* Effect.addFinalizer(() => drain.pipe(Effect.timeout(DRAIN_TIMEOUT), Effect.ignore));
        yield* Effect.addFinalizer(() => Effect.sync(() => emitter.removeAllListeners()));

        register(emitter, run as RunListener<R>);

        return Events.of({
          emit: (name, payload) =>
            Effect.sync(() => {
              emitter.emit(name, payload);
            }),
          emitAsync: (name, payload) => Effect.promise(() => emitter.emitAsync(name, payload)),
          drain,
        });
      }),
    );
}
