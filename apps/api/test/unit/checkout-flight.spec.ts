import { layer } from '@effect/vitest';
import { and, eq, gt, sql } from 'drizzle-orm';
import { Effect, Exit, Fiber, Latch } from 'effect';
import { randomUUID } from 'node:crypto';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import { cronLease } from '../../src/infra/database/schema/index.js';
import { withFirmFlight } from '../../src/modules/billing/checkout-flight.js';
import { RequestsRepo } from '../../src/modules/requests/request.repo.js';

/* Dois cliques concorrentes criavam duas assinaturas no gateway, e com duas máquinas no Fly
 * um lock em memória não via o outro clique. A lease mora no banco: o segundo checkout da
 * MESMA firma leva 409 enquanto o primeiro está em voo, firmas diferentes não se bloqueiam,
 * e a lease sai no sucesso, na falha e na interrupção. */
const leaseHeld = (firmId: string) =>
  Effect.promise(async () => {
    const rows = await db
      .select({ name: cronLease.name })
      .from(cronLease)
      .where(and(eq(cronLease.name, `checkout:${firmId}`), gt(cronLease.expiresAt, sql`now()`)));
    return rows.length > 0;
  });

const failedInFlight = <A, E>(exit: Exit.Exit<A, E>) =>
  Exit.isFailure(exit) && String(exit.cause).includes('CheckoutInFlight');

layer(RequestsRepo.layer)('withFirmFlight', (it) => {
  beforeAll(() => truncateAll());

  it.effect('serializa por firma, libera no fim e não bloqueia outra firma', () =>
    Effect.gen(function* () {
      const [firmA, firmB] = [randomUUID(), randomUUID()];
      const gate = yield* Latch.make();
      const entered = yield* Latch.make();
      const first = yield* Effect.forkChild(
        withFirmFlight(firmA, Effect.andThen(entered.open, Effect.as(gate.await, 'primeiro'))),
      );
      yield* entered.await;
      expect(yield* leaseHeld(firmA)).toBe(true);

      const second = yield* Effect.exit(withFirmFlight(firmA, Effect.succeed('segundo')));
      expect(failedInFlight(second)).toBe(true);

      expect(yield* withFirmFlight(firmB, Effect.succeed('outra firma'))).toBe('outra firma');

      yield* gate.open;
      expect(yield* Fiber.join(first)).toBe('primeiro');
      expect(yield* leaseHeld(firmA)).toBe(false);

      expect(yield* withFirmFlight(firmA, Effect.succeed('terceiro'))).toBe('terceiro');
    }),
  );

  it.effect('a lease sai também quando o checkout falha', () =>
    Effect.gen(function* () {
      const firm = randomUUID();
      const failed = yield* Effect.exit(withFirmFlight(firm, Effect.fail('boom')));
      expect(Exit.isFailure(failed)).toBe(true);
      expect(failedInFlight(failed)).toBe(false);

      expect(yield* withFirmFlight(firm, Effect.succeed('de novo'))).toBe('de novo');
    }),
  );

  it.effect('a lease sai também quando o checkout é interrompido', () =>
    Effect.gen(function* () {
      const firm = randomUUID();
      const entered = yield* Latch.make();
      const stuck = yield* Effect.forkChild(
        withFirmFlight(firm, Effect.andThen(entered.open, Effect.never)),
      );
      yield* entered.await;
      yield* Fiber.interrupt(stuck);

      expect(yield* withFirmFlight(firm, Effect.succeed('depois'))).toBe('depois');
    }),
  );
});
