import type { SubscriptionStatus } from '@competa/contracts';

/** O que cada evento de cobrança do Asaas faz com a assinatura. `null` = evento conhecido
 *  que não mexe no acesso (visualização, negativação, split, ciclo de vida da cobrança).
 *
 *  Os dois pontos que não são óbvios, e que custaram caro:
 *
 *  1. No CARTÃO o fluxo é `PAYMENT_CONFIRMED` → **32 dias** → `PAYMENT_RECEIVED`. Ativar só
 *     no `RECEIVED` deixava quem pagou no cartão um mês sem acesso. No Pix não existe
 *     `CONFIRMED`: o `RECEIVED` vem direto. Por isso os dois liberam.
 *  2. Estorno e chargeback viram `OVERDUE`, não `CANCELED`: é recuperável, e pagar de novo
 *     reativa pelo mesmo caminho. `CANCELED` fica para o encerramento deliberado. */
export const statusForPaymentEvent = (event: string): SubscriptionStatus | null => {
  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
    case 'PAYMENT_RECEIVED_IN_CASH':
    case 'PAYMENT_DUNNING_RECEIVED':
      return 'ACTIVE';

    case 'PAYMENT_OVERDUE':
    case 'PAYMENT_DELETED':
    case 'PAYMENT_REFUNDED':
    case 'PAYMENT_CHARGEBACK_REQUESTED':
    case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
    case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
      return 'OVERDUE';

    default:
      return null;
  }
};
