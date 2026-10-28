import {
  PLANS,
  planPrice,
  type BillingCycle,
  type PaidPlanName,
  type PriceOverride,
  type SubscriptionStatus,
} from '@competa/contracts';

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

/** Eventos da PRÓPRIA assinatura. Inativar ou apagar no painel do Asaas encerra a cobrança
 *  recorrente: a firma fica `CANCELED` e o acesso vale até o fim do período já pago. */
export const statusForSubscriptionEvent = (event: string): SubscriptionStatus | null =>
  event === 'SUBSCRIPTION_INACTIVATED' || event === 'SUBSCRIPTION_DELETED' ? 'CANCELED' : null;

export type PaymentFacts = {
  readonly id?: string;
  readonly value?: number;
  readonly dueDate?: Date;
  readonly paymentDate?: Date;
};

export type PendingPlan = {
  readonly planName: PaidPlanName;
  readonly cycle: BillingCycle;
  readonly paymentId: string | null;
  readonly priceOverride: PriceOverride | null;
};

/** A intenção do checkout só vira plano quando o pagamento é DO plano pendente. Um
 *  `PAYMENT_RECEIVED` atrasado da fatura antiga (no cartão ele chega 32 dias depois do
 *  `CONFIRMED`) promovia qualquer checkout feito nesse meio-tempo sem um centavo a mais.
 *
 *  Com o id da fatura gravado no checkout, é ele que decide. Sem ele (checkout anterior a
 *  esta regra), vale um valor que cubra o preço do plano pendente. */
export const paymentCoversPendingPlan = (payment: PaymentFacts, pending: PendingPlan): boolean => {
  if (pending.paymentId) return payment.id === pending.paymentId;
  if (payment.value === undefined) return false;

  const price = planPrice(
    PLANS[pending.planName],
    pending.cycle,
    pending.priceOverride?.[pending.planName],
  );

  return payment.value >= price;
};

/** Cobrança de um período que já ficou para trás não derruba a firma: o operador que apaga
 *  a fatura antiga depois de o cliente pagar a nova gerava `PAYMENT_DELETED` → `OVERDUE`
 *  numa assinatura em dia. Sem data (payload legado) ou sem período aberto, vale. */
export const paymentIsCurrent = (
  dueDate: Date | undefined,
  currentPeriodStart: Date | null,
): boolean =>
  dueDate === undefined ||
  currentPeriodStart === null ||
  dueDate.getTime() >= currentPeriodStart.getTime();

/* Aritmética em UTC, não no fuso do processo: `addMonths` do date-fns soma no horário
 * local, e 31/01 00:00Z (30/01 21:00 em São Paulo) virava 01/03 00:00Z em vez de 28/02. */
const addUtcMonths = (date: Date, months: number) => {
  const result = new Date(date);
  const dayOfMonth = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0));
  result.setUTCDate(Math.min(dayOfMonth, lastDay.getUTCDate()));
  return result;
};

/** O período ancora na data de VENCIMENTO da fatura, que é onde o Asaas ancora o ciclo da
 *  assinatura — não no instante em que o webhook chegou. Um reenvio dias depois, ou um
 *  boleto pago com atraso, não ganha dias de graça nem desalinha a próxima cobrança. */
export const periodFrom = (anchor: Date, cycle: string) => ({
  currentPeriodStart: anchor,
  currentPeriodEnd: addUtcMonths(anchor, cycle === 'yearly' ? 12 : 1),
});

/** `YYYY-MM-DD` do Asaas, lido como meia-noite UTC. Qualquer outra coisa é ausência. */
export const asaasDate = (value: string | null | undefined): Date | undefined =>
  value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : undefined;

/** Menor cobrança que o Asaas emite. Abaixo disto não há o que cobrar agora. */
export const MIN_CHARGE = 5;

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Upgrade com assinatura em dia e sem fatura em aberto: cobra AGORA o novo ciclo inteiro,
 *  descontado o que sobrou do período já pago, e o novo período começa hoje. Sem isto a
 *  troca só valia na próxima fatura — até 12 meses no anual. `null` = não há o que cobrar
 *  (o crédito cobre o novo ciclo): aplica na hora. */
export const upgradeChargeNow = (input: {
  readonly currentPrice: number;
  readonly newPrice: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly now: Date;
}): number | null => {
  const total = input.periodEnd.getTime() - input.periodStart.getTime();
  const remaining = Math.min(Math.max(input.periodEnd.getTime() - input.now.getTime(), 0), total);
  const credit = total > 0 ? (input.currentPrice * remaining) / total : 0;
  const due = round2(input.newPrice - credit);

  return due >= MIN_CHARGE ? due : null;
};
