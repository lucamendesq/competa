import { AppError } from '../../lib/app-error.js';

/** O gateway não respondeu (timeout) ou respondeu erro. 503 e não 500: não é bug nosso, e o
 *  Contador pode tentar de novo. */
export class GatewayUnavailable extends AppError {
  readonly _tag = 'GatewayUnavailable';
  readonly code = 'BILLING_GATEWAY_UNAVAILABLE';
  readonly status = 503;

  constructor() {
    super('O serviço de pagamento não respondeu. Tente de novo em instantes.');
  }
}

export class CheckoutInFlight extends AppError {
  readonly _tag = 'CheckoutInFlight';
  readonly code = 'CHECKOUT_IN_FLIGHT';
  readonly status = 409;

  constructor() {
    super('Já existe um checkout em andamento para esta Contabilidade. Aguarde ele terminar.');
  }
}
