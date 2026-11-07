import { Effect } from 'effect';
import { RequestsRepo } from '../requests/request.repo.js';
import { CheckoutInFlight } from './errors.js';

export const withFirmFlight = <A, E, R>(firmId: string, effect: Effect.Effect<A, E, R>) =>
  RequestsRepo.use((repo) => repo.withLease(`checkout:${firmId}`, effect)).pipe(
    Effect.flatMap((result) =>
      result === null ? Effect.fail(new CheckoutInFlight()) : Effect.succeed(result),
    ),
  );
