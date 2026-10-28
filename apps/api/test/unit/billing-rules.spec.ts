import { describe, expect, it } from 'vitest';
import { statusForPaymentEvent } from '../../src/modules/billing/billing-rules.js';

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
