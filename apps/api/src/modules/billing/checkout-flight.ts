import { Effect } from 'effect';
import { CheckoutInFlight } from './errors.js';

/** Um checkout por Contabilidade de cada vez: dois cliques concorrentes criavam duas
 *  assinaturas (e dois clientes) no gateway, e só a segunda ficava gravada — a cobrança da
 *  primeira seguia pagável sem ativar ninguém. Chave por firma, não por processo: os ids são
 *  UUID, então duas apps no mesmo processo (a suíte) nunca colidem.
 *  ponytail: em memória; vira lock no banco quando houver mais de uma instância. */
const inFlight = new Set<string>();

export const withFirmFlight = <A, E, R>(
  firmId: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E | CheckoutInFlight, R> =>
  Effect.suspend((): Effect.Effect<A, E | CheckoutInFlight, R> => {
    if (inFlight.has(firmId)) return Effect.fail(new CheckoutInFlight());
    inFlight.add(firmId);

    return effect.pipe(Effect.ensuring(Effect.sync(() => inFlight.delete(firmId))));
  });
