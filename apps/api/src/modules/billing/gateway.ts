import { Effect } from 'effect';
import env from '../../config/env.js';
import { isAppError } from '../../lib/app-error.js';
import { GatewayUnavailable } from './errors.js';
import { AsaasBilling } from './providers/asaas-billing.provider.js';
import { LogBilling } from './providers/log-billing.provider.js';

/** O provedor do processo: o checkout e o webhook (que reajusta a assinatura depois de uma
 *  troca paga) falam com o mesmo. */
export const billing = env.NODE_ENV === 'production' ? new AsaasBilling() : new LogBilling();

/** Toda chamada ao gateway passa por aqui: timeout ou erro dele vira 503 com mensagem para o
 *  Contador, não 500 com stack. */
export const gateway = <A>(call: () => Promise<A>) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) => (isAppError(cause) ? cause : new GatewayUnavailable()),
  });
