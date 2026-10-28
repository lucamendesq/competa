import { describe, expect, it } from 'vitest';
import {
  asaasDate,
  paymentCoversPendingPlan,
  paymentIsCurrent,
  periodFrom,
  statusForPaymentEvent,
  statusForSubscriptionEvent,
  upgradeChargeNow,
} from '../../src/modules/billing/billing-rules.js';

/* Casos derivados da tabela "Payment events" da doc do Asaas
 * (https://docs.asaas.com/docs/payment-events), não do que o código faz hoje. */

describe('statusForPaymentEvent — evento de cobrança → estado da assinatura', () => {
  /* O achado que motivou tudo: no CARTÃO o fluxo documentado é
   * `PAYMENT_CREATED → PAYMENT_CONFIRMED → espera 32 dias → PAYMENT_RECEIVED`.
   * Ativar só no `RECEIVED` deixava quem pagou no cartão um mês sem acesso. */
  it('CONFIRMED ativa: no cartão ele vem 32 dias ANTES do RECEIVED', () => {
    expect(statusForPaymentEvent('PAYMENT_CONFIRMED')).toBe('ACTIVE');
  });

  /* No Pix não existe `CONFIRMED` — o fluxo é `CREATED → RECEIVED`. Os dois precisam
   * liberar, ou um dos meios de pagamento fica de fora. */
  it('RECEIVED ativa: no Pix é o primeiro evento de pagamento', () => {
    expect(statusForPaymentEvent('PAYMENT_RECEIVED')).toBe('ACTIVE');
  });

  it('dinheiro em espécie e negativação paga também ativam', () => {
    expect(statusForPaymentEvent('PAYMENT_RECEIVED_IN_CASH')).toBe('ACTIVE');
    expect(statusForPaymentEvent('PAYMENT_DUNNING_RECEIVED')).toBe('ACTIVE');
  });

  it('vencimento e remoção da cobrança bloqueiam', () => {
    expect(statusForPaymentEvent('PAYMENT_OVERDUE')).toBe('OVERDUE');
    expect(statusForPaymentEvent('PAYMENT_DELETED')).toBe('OVERDUE');
  });

  /* Dinheiro devolvido, acesso devolvido. `OVERDUE` e não `CANCELED` porque é recuperável:
   * pagar de novo reativa pelo mesmo caminho. */
  it('estorno e chargeback bloqueiam, e de forma recuperável', () => {
    expect(statusForPaymentEvent('PAYMENT_REFUNDED')).toBe('OVERDUE');
    expect(statusForPaymentEvent('PAYMENT_CHARGEBACK_REQUESTED')).toBe('OVERDUE');
  });

  it('cartão recusado na análise de risco ou na captura bloqueia', () => {
    expect(statusForPaymentEvent('PAYMENT_REPROVED_BY_RISK_ANALYSIS')).toBe('OVERDUE');
    expect(statusForPaymentEvent('PAYMENT_CREDIT_CARD_CAPTURE_REFUSED')).toBe('OVERDUE');
  });

  /* Eventos de ruído: existem no fluxo documentado e NÃO podem mexer no acesso. Um
   * `BANK_SLIP_VIEWED` que bloqueasse a firma seria estrago silencioso. */
  it('eventos informativos não mexem no acesso', () => {
    for (const event of [
      'PAYMENT_CREATED',
      'PAYMENT_UPDATED',
      'PAYMENT_ANTICIPATED',
      'PAYMENT_RESTORED',
      'PAYMENT_BANK_SLIP_VIEWED',
      'PAYMENT_CHECKOUT_VIEWED',
      'PAYMENT_BANK_SLIP_CANCELLED',
      'PAYMENT_DUNNING_REQUESTED',
      'PAYMENT_SPLIT_DONE',
      'PAYMENT_PARTIALLY_REFUNDED',
    ]) {
      expect(statusForPaymentEvent(event), event).toBeNull();
    }
  });

  /* A doc avisa que novos eventos entram sem aviso e que estourar neles trava a fila de
   * sincronização do gateway. Desconhecido tem de ser inerte, nunca exceção. */
  it('evento desconhecido é inerte', () => {
    expect(statusForPaymentEvent('PAYMENT_ALGO_QUE_NAO_EXISTE_AINDA')).toBeNull();
    expect(statusForPaymentEvent('')).toBeNull();
  });
});

describe('statusForSubscriptionEvent — evento da própria assinatura', () => {
  it('inativar ou apagar a assinatura no Asaas cancela; o resto é inerte', () => {
    expect(statusForSubscriptionEvent('SUBSCRIPTION_INACTIVATED')).toBe('CANCELED');
    expect(statusForSubscriptionEvent('SUBSCRIPTION_DELETED')).toBe('CANCELED');
    expect(statusForSubscriptionEvent('SUBSCRIPTION_CREATED')).toBeNull();
    expect(statusForSubscriptionEvent('SUBSCRIPTION_UPDATED')).toBeNull();
    expect(statusForSubscriptionEvent('PAYMENT_RECEIVED')).toBeNull();
  });
});

describe('paymentCoversPendingPlan — o pagamento é DO plano pendente?', () => {
  const pending = {
    planName: 'profissional' as const,
    cycle: 'monthly' as const,
    paymentId: null,
    priceOverride: null,
  };

  it('com o id da fatura gravado, só ele decide — valor não compensa', () => {
    const withId = { ...pending, paymentId: 'pay_1' };
    expect(paymentCoversPendingPlan({ id: 'pay_1', value: 1 }, withId)).toBe(true);
    expect(paymentCoversPendingPlan({ id: 'pay_2', value: 9999 }, withId)).toBe(false);
    expect(paymentCoversPendingPlan({ value: 9999 }, withId)).toBe(false);
  });

  it('sem id gravado, vale o valor do plano pendente no ciclo pendente, com a Oferta Fundador', () => {
    expect(paymentCoversPendingPlan({ value: 189 }, pending)).toBe(true);
    expect(paymentCoversPendingPlan({ value: 188.99 }, pending)).toBe(false);
    expect(paymentCoversPendingPlan({}, pending)).toBe(false);
    expect(paymentCoversPendingPlan({ value: 1890 }, { ...pending, cycle: 'yearly' })).toBe(true);
    expect(paymentCoversPendingPlan({ value: 189 }, { ...pending, cycle: 'yearly' })).toBe(false);
    expect(
      paymentCoversPendingPlan(
        { value: 139 },
        { ...pending, priceOverride: { profissional: 139 } },
      ),
    ).toBe(true);
  });
});

describe('paymentIsCurrent e periodFrom', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

  it('fatura vencida antes do período corrente é antiga; sem data ou sem período, vale', () => {
    expect(paymentIsCurrent(day('2026-10-01'), day('2026-11-01'))).toBe(false);
    expect(paymentIsCurrent(day('2026-11-01'), day('2026-11-01'))).toBe(true);
    expect(paymentIsCurrent(day('2026-12-01'), day('2026-11-01'))).toBe(true);
    expect(paymentIsCurrent(undefined, day('2026-11-01'))).toBe(true);
    expect(paymentIsCurrent(day('2020-01-01'), null)).toBe(true);
  });

  it('o período ancora na data dada: mensal +1 mês, anual +1 ano', () => {
    expect(periodFrom(day('2026-01-31'), 'monthly')).toEqual({
      currentPeriodStart: day('2026-01-31'),
      currentPeriodEnd: day('2026-02-28'),
    });
    expect(periodFrom(day('2026-11-03'), 'yearly')).toEqual({
      currentPeriodStart: day('2026-11-03'),
      currentPeriodEnd: day('2027-11-03'),
    });
  });

  it('asaasDate lê YYYY-MM-DD como meia-noite UTC e ignora o resto', () => {
    expect(asaasDate('2026-11-03')).toEqual(day('2026-11-03'));
    expect(asaasDate(null)).toBeUndefined();
    expect(asaasDate(undefined)).toBeUndefined();
    expect(asaasDate('03/11/2026')).toBeUndefined();
    expect(asaasDate('')).toBeUndefined();
  });
});

describe('upgradeChargeNow — upgrade com assinatura em dia', () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
  const period = { periodStart: day('2026-11-01'), periodEnd: day('2026-12-01') };

  it('cobra o novo ciclo descontado do que sobrou do atual', () => {
    /* Metade do mês de Essencial (119) já usada: crédito 59,50 sobre Profissional 189. */
    expect(
      upgradeChargeNow({ currentPrice: 119, newPrice: 189, now: day('2026-11-16'), ...period }),
    ).toBe(129.5);
  });

  it('período inteiro ainda por vir: cobra só a diferença; período acabado: cobra tudo', () => {
    expect(
      upgradeChargeNow({ currentPrice: 119, newPrice: 189, now: day('2026-11-01'), ...period }),
    ).toBe(70);
    expect(
      upgradeChargeNow({ currentPrice: 119, newPrice: 189, now: day('2026-12-15'), ...period }),
    ).toBe(189);
  });

  it('crédito que cobre o novo ciclo, ou sobra abaixo do mínimo do gateway, não cobra: aplica na hora', () => {
    expect(
      upgradeChargeNow({ currentPrice: 1890, newPrice: 189, now: day('2026-11-02'), ...period }),
    ).toBeNull();
    expect(
      upgradeChargeNow({ currentPrice: 189, newPrice: 190, now: day('2026-11-01'), ...period }),
    ).toBeNull();
  });
});
