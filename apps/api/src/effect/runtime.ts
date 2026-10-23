import { Cause, Effect, Exit, Layer, ManagedRuntime } from 'effect';
import { Db, DbError } from '../infra/database/effect.js';
import { ContactsRepo } from '../modules/contacts/contact.repo.js';
import { PeriodsRepo } from '../modules/periods/period.repo.js';

export const AppLayer = Layer.mergeAll(PeriodsRepo.layerNoDeps, ContactsRepo.layerNoDeps).pipe(
  Layer.provideMerge(Db.layer),
);

export type AppContext = Layer.Success<typeof AppLayer>;

export const runtime = ManagedRuntime.make(AppLayer);

/** Fronteira Nest→Effect. `DbError` é desembrulhado para o erro cru do driver: o
 *  `AppErrorFilter` e os logs continuam vendo exatamente o que viam antes da migração. */
export async function run<A, E>(effect: Effect.Effect<A, E, AppContext>): Promise<A> {
  const exit = await runtime.runPromiseExit(effect);
  if (Exit.isSuccess(exit)) return exit.value;

  const error = Cause.squash(exit.cause);
  throw error instanceof DbError ? error.cause : error;
}
