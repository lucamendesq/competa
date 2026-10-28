import { Effect, Exit, Fiber, Latch } from 'effect';
import { describe, expect, it } from 'vitest';
import { withFirmFlight } from '../../src/modules/billing/checkout-flight.js';

/* Dois cliques concorrentes criavam duas assinaturas no gateway. O segundo checkout da
 * MESMA firma leva 409 enquanto o primeiro está em voo; firmas diferentes não se bloqueiam;
 * a chave sai tanto no sucesso quanto na falha. */
describe('withFirmFlight', () => {
  it('serializa por firma, libera no fim e não bloqueia outra firma', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const gate = yield* Latch.make();
        const first = yield* Effect.forkChild(
          withFirmFlight('firm-a', Effect.as(gate.await, 'primeiro')),
        );
        yield* Effect.yieldNow;

        const second = yield* Effect.exit(withFirmFlight('firm-a', Effect.succeed('segundo')));
        expect(Exit.isFailure(second)).toBe(true);
        if (Exit.isFailure(second)) {
          expect(String(second.cause)).toContain('CheckoutInFlight');
        }

        expect(yield* withFirmFlight('firm-b', Effect.succeed('outra firma'))).toBe('outra firma');

        yield* gate.open;
        expect(yield* Fiber.join(first)).toBe('primeiro');

        expect(yield* withFirmFlight('firm-a', Effect.succeed('terceiro'))).toBe('terceiro');
      }),
    );
  });

  it('a chave sai também quando o checkout falha', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const failed = yield* Effect.exit(withFirmFlight('firm-c', Effect.fail('boom')));
        expect(Exit.isFailure(failed)).toBe(true);

        expect(yield* withFirmFlight('firm-c', Effect.succeed('de novo'))).toBe('de novo');
      }),
    );
  });
});
