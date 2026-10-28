import { Exit, Layer, ManagedRuntime, type Effect } from 'effect';
import { DbPool } from '../infra/database/effect.js';
import { squashError } from '../infra/database/error.js';
import { AppLayer, type AppContext } from './runtime.js';

/* Script é processo próprio e curto: um runtime, dono do pool, montado no primeiro uso. */
let runtime: ManagedRuntime.ManagedRuntime<AppContext, never> | undefined;

/** Fronteira Effect→promise dos scripts de verificação. Lança o erro cru, para os `assert`
 *  deles compararem com `instanceof`. */
export async function run<A, E>(effect: Effect.Effect<A, E, AppContext>): Promise<A> {
  runtime ??= ManagedRuntime.make(AppLayer.pipe(Layer.provide(DbPool.layer)));
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;

  throw squashError(exit.cause);
}
