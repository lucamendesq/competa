import { Context, Effect, Layer } from 'effect';
import { and, eq, or, sql } from 'drizzle-orm';
import * as z from 'zod';
import { PLANS, planPrice, type BillingCycle, type PaidPlanName } from '@competa/contracts';
import { Db } from '../../infra/database/effect.js';
import type { AppError } from '../../lib/app-error.js';
import { billingWebhookEvent, subscription } from '../../infra/database/schema/index.js';
import {
  paymentCoversPendingPlan,
  paymentIsCurrent,
  periodFrom,
  statusForPaymentEvent,
  statusForSubscriptionEvent,
  type PaymentFacts,
} from './billing-rules.js';

const UUID = z.uuid();

export type WebhookEvent = {
  readonly eventId: string;
  readonly event: string;
  /** `payment.subscription` ou `subscription.id` do payload. */
  readonly gatewaySubscriptionId: string | null;
  /** `externalReference` do payload: é o id da Contabilidade, posto por nós na criação. */
  readonly externalReference: string | null;
  readonly payment: PaymentFacts;
};

/** Reajuste da assinatura no gateway depois que a cobrança avulsa de uma troca de plano é
 *  paga. Roda DENTRO da transação do evento: se o gateway falhar, o evento volta a ficar
 *  livre e o reenvio do Asaas tenta de novo. */
export type GatewayReprice = {
  readonly subscriptionId: string;
  readonly planName: PaidPlanName;
  readonly cycle: BillingCycle;
  readonly value: number;
  readonly nextDueDate: Date;
};

export type WebhookOutcome =
  | { readonly outcome: 'duplicate' }
  | {
      readonly outcome: 'ignored';
      readonly reason: 'event' | 'unknown' | 'stale' | 'canceled' | 'trial' | 'charge';
    }
  | { readonly outcome: 'applied'; readonly status: string; readonly promoted: boolean };

const make = Effect.gen(function* () {
  const db = yield* Db;

  const findByFirm = Effect.fn('SubscriptionsRepo.findByFirm')(function* (firmId: string) {
    const [row] = yield* db.use((d) =>
      d.select().from(subscription).where(eq(subscription.accountingFirmId, firmId)).limit(1),
    );

    return row;
  });

  /** Grava a INTENÇÃO do checkout junto dos ids do gateway; quem promove o plano é o webhook.
   *  `planName`/`cycle` NÃO mudam aqui: o gate de capability lê `planName`, então gravá-lo no
   *  checkout liberava plano pago antes do pagamento.
   *
   *  O id da assinatura anterior vai para o histórico: a cobrança dela continua pagável, e o
   *  webhook precisa achar a firma por ele. */
  const startCheckout = Effect.fn('SubscriptionsRepo.startCheckout')(function* (input: {
    firmId: string;
    planName: PaidPlanName;
    cycle: BillingCycle;
    gatewayCustomerId: string;
    gatewaySubscriptionId: string;
    pendingPaymentId: string | null;
    pendingInvoiceUrl: string | null;
  }) {
    yield* db.use((d) =>
      d
        .update(subscription)
        .set({
          pendingPlanName: input.planName,
          pendingCycle: input.cycle,
          pendingPaymentId: input.pendingPaymentId,
          pendingInvoiceUrl: input.pendingInvoiceUrl,
          gatewayCustomerId: input.gatewayCustomerId,
          gatewaySubscriptionId: input.gatewaySubscriptionId,
          previousGatewaySubscriptionIds: sql`case
            when ${subscription.gatewaySubscriptionId} is not null
              and ${subscription.gatewaySubscriptionId} <> ${input.gatewaySubscriptionId}
            then array_append(${subscription.previousGatewaySubscriptionIds}, ${subscription.gatewaySubscriptionId})
            else ${subscription.previousGatewaySubscriptionIds}
          end`,
        })
        .where(eq(subscription.accountingFirmId, input.firmId)),
    );
  });

  /** Troca de plano que não precisa de pagamento (mesmo preço ou menor, com assinatura em
   *  dia): vale na hora, e a próxima fatura já sai no valor novo. */
  const applyPlanNow = Effect.fn('SubscriptionsRepo.applyPlanNow')(function* (input: {
    firmId: string;
    planName: PaidPlanName;
    cycle: BillingCycle;
  }) {
    yield* db.use((d) =>
      d
        .update(subscription)
        .set({
          planName: input.planName,
          cycle: input.cycle,
          pendingPlanName: null,
          pendingCycle: null,
          pendingPaymentId: null,
          pendingInvoiceUrl: null,
        })
        .where(eq(subscription.accountingFirmId, input.firmId)),
    );
  });

  /** Encerramento deliberado: o acesso segue até `currentPeriodEnd` (o guard lê a data), e
   *  nada fica pendente. */
  const cancel = Effect.fn('SubscriptionsRepo.cancel')(function* (firmId: string) {
    yield* db.use((d) =>
      d
        .update(subscription)
        .set({
          status: 'CANCELED',
          pendingPlanName: null,
          pendingCycle: null,
          pendingPaymentId: null,
          pendingInvoiceUrl: null,
        })
        .where(eq(subscription.accountingFirmId, firmId)),
    );
  });

  /** Reivindica o evento do gateway. `true` = primeira vez (pode processar); `false` = já
   *  veio antes. `onConflictDoNothing` resolve a corrida entre duas entregas simultâneas:
   *  quem inserir ganha, o outro vê zero linhas. */
  const claimEvent = Effect.fn('SubscriptionsRepo.claimEvent')(function* (
    eventId: string,
    event: string,
  ) {
    const claimed = yield* db.use((d) =>
      d
        .insert(billingWebhookEvent)
        .values({ id: eventId, event })
        .onConflictDoNothing()
        .returning({ id: billingWebhookEvent.id }),
    );

    return claimed.length > 0;
  });

  /** A firma pelo id da assinatura (atual ou substituída) e, sem ele, pelo `externalReference`
   *  — que é o id da firma. Uma cobrança avulsa (troca de plano) não tem `subscription`. */
  const findByGateway = (gatewaySubscriptionId: string | null, externalReference: string | null) =>
    Effect.gen(function* () {
      if (gatewaySubscriptionId) {
        const [row] = yield* db.use((d) =>
          d
            .select()
            .from(subscription)
            .where(
              or(
                eq(subscription.gatewaySubscriptionId, gatewaySubscriptionId),
                sql`${gatewaySubscriptionId} = any(${subscription.previousGatewaySubscriptionIds})`,
              ),
            )
            .limit(1),
        );
        if (row) return row;
      }

      if (externalReference && UUID.safeParse(externalReference).success) {
        const [row] = yield* db.use((d) =>
          d
            .select()
            .from(subscription)
            .where(eq(subscription.accountingFirmId, externalReference))
            .limit(1),
        );
        return row;
      }

      return undefined;
    });

  /** Reivindicação e efeito na MESMA transação: se o efeito falhar, a reivindicação volta e
   *  o reenvio do Asaas processa de novo. Separados, a falha deixava o evento marcado como
   *  visto e o pagamento perdido para sempre. */
  const applyEvent = Effect.fn('SubscriptionsRepo.applyEvent')(function* (
    input: WebhookEvent,
    reprice: (change: GatewayReprice) => Effect.Effect<void, AppError> = () => Effect.void,
  ) {
    return yield* db.withTransaction(
      Effect.gen(function* () {
        const first = yield* claimEvent(input.eventId, input.event);
        if (!first) return { outcome: 'duplicate' } as const;

        const status =
          statusForPaymentEvent(input.event) ?? statusForSubscriptionEvent(input.event);
        if (!status) return { outcome: 'ignored', reason: 'event' } as const;

        const row = yield* findByGateway(input.gatewaySubscriptionId, input.externalReference);
        if (!row) return { outcome: 'ignored', reason: 'unknown' } as const;

        /* Só a assinatura ATUAL tira acesso. A substituída no checkout ainda gera eventos — o
         * próprio fallback do checkout a inativa (`SUBSCRIPTION_INACTIVATED`) e o Asaas apaga
         * as cobranças dela —, e eles derrubavam a firma que acabou de assinar de novo. */
        if (
          status !== 'ACTIVE' &&
          input.gatewaySubscriptionId &&
          input.gatewaySubscriptionId !== row.gatewaySubscriptionId
        ) {
          return { outcome: 'ignored', reason: 'stale' } as const;
        }

        if (
          status === 'OVERDUE' &&
          !paymentIsCurrent(input.payment.dueDate, row.currentPeriodStart)
        ) {
          return { outcome: 'ignored', reason: 'stale' } as const;
        }

        /* Cancelada já perdeu a cobrança recorrente; o acesso vai até `currentPeriodEnd`
         * (D19 #3). Apagar a assinatura no gateway apaga as cobranças em aberto, e o
         * `PAYMENT_DELETED` delas não pode virar bloqueio imediato. */
        if (status === 'OVERDUE' && row.status === 'CANCELED') {
          return { outcome: 'ignored', reason: 'canceled' } as const;
        }

        /* Trial vale até `trialEndsAt` mesmo com a fatura do checkout antecipado vencida; o
         * guard bloqueia quando o trial acaba. A intenção fica: o boleto vencido segue
         * pagável e promove o plano. */
        if (
          status === 'OVERDUE' &&
          row.status === 'trialing' &&
          row.trialEndsAt !== null &&
          row.trialEndsAt.getTime() > Date.now()
        ) {
          return { outcome: 'ignored', reason: 'trial' } as const;
        }

        /* Cobrança avulsa (troca de plano) não governa o acesso — quem governa é a
         * assinatura, e o período dela já está pago. A avulsa que vence, é apagada ou
         * estornada sem ter promovido nada só desfaz a intenção da troca. */
        if (status !== 'ACTIVE' && !input.gatewaySubscriptionId) {
          if (input.payment.id && input.payment.id === row.pendingPaymentId) {
            yield* db.use((d) =>
              d
                .update(subscription)
                .set({
                  pendingPlanName: null,
                  pendingCycle: null,
                  pendingPaymentId: null,
                  pendingInvoiceUrl: null,
                })
                .where(eq(subscription.id, row.id)),
            );
          }
          return { outcome: 'ignored', reason: 'charge' } as const;
        }

        const pending = row.pendingPlanName
          ? {
              planName: row.pendingPlanName as PaidPlanName,
              cycle: (row.pendingCycle ?? row.cycle) as BillingCycle,
              paymentId: row.pendingPaymentId,
              priceOverride: row.priceOverride ?? null,
            }
          : null;
        const coversPending =
          status === 'ACTIVE' &&
          pending !== null &&
          paymentCoversPendingPlan(input.payment, pending);

        /* Firma cancelada só volta pelo pagamento do checkout feito DEPOIS do cancelamento (o
         * cancelamento limpa a intenção). O `RECEIVED` tardio do cartão, que chega 32 dias
         * depois do `CONFIRMED` de uma fatura antiga, não reativa. */
        if (status === 'ACTIVE' && row.status === 'CANCELED' && !coversPending) {
          return { outcome: 'ignored', reason: 'canceled' } as const;
        }

        const promoted =
          coversPending && pending
            ? {
                planName: pending.planName,
                cycle: pending.cycle,
                pendingPlanName: null,
                pendingCycle: null,
                pendingPaymentId: null,
                pendingInvoiceUrl: null,
              }
            : {};

        /* O período só anda para a frente: o pagamento atrasado de uma fatura antiga ativa a
         * firma (dinheiro é dinheiro) mas não encurta o período que a nova já abriu. */
        const anchor = input.payment.dueDate ?? input.payment.paymentDate ?? new Date();
        const period = status === 'ACTIVE' ? periodFrom(anchor, promoted.cycle ?? row.cycle) : null;
        const periodPatch =
          period && (!row.currentPeriodEnd || period.currentPeriodEnd > row.currentPeriodEnd)
            ? period
            : {};

        const canceled =
          status === 'CANCELED'
            ? {
                pendingPlanName: null,
                pendingCycle: null,
                pendingPaymentId: null,
                pendingInvoiceUrl: null,
              }
            : {};

        yield* db.use((d) =>
          d
            .update(subscription)
            .set({ status, ...promoted, ...periodPatch, ...canceled })
            .where(eq(subscription.id, row.id)),
        );

        /* A troca paga por cobrança avulsa só reajusta a assinatura agora: reajustar no
         * checkout cobrava o plano novo de quem nunca pagou a diferença. O próximo
         * vencimento é o fim do período que esta cobrança abriu. */
        if (
          coversPending &&
          pending &&
          !input.gatewaySubscriptionId &&
          row.gatewaySubscriptionId &&
          period
        ) {
          yield* reprice({
            subscriptionId: row.gatewaySubscriptionId,
            planName: pending.planName,
            cycle: pending.cycle,
            value: planPrice(
              PLANS[pending.planName],
              pending.cycle,
              row.priceOverride?.[pending.planName],
            ),
            nextDueDate: period.currentPeriodEnd,
          });
        }

        return { outcome: 'applied', status, promoted: 'planName' in promoted } as const;
      }),
    );
  });

  /** Régua de reconciliação: `ACTIVE` cujo período acabou há mais de `graceDays` vira
   *  `OVERDUE` mesmo sem webhook. A fila do Asaas pausa depois de 15 falhas seguidas e
   *  guarda os eventos por 14 dias; sem esta varredura a firma ficava ativa para sempre. */
  const expireLapsed = Effect.fn('SubscriptionsRepo.expireLapsed')(function* (
    now: Date,
    graceDays: number,
  ) {
    const rows = yield* db.use((d) =>
      d
        .update(subscription)
        .set({ status: 'OVERDUE' })
        .where(
          and(
            eq(subscription.status, 'ACTIVE'),
            sql`${subscription.currentPeriodEnd} + make_interval(days => ${graceDays}) < ${now}`,
          ),
        )
        .returning({ firmId: subscription.accountingFirmId }),
    );

    return rows.map((row) => row.firmId);
  });

  /** Os eventos já processados só servem para barrar reenvio, e o Asaas reenvia por no
   *  máximo 14 dias. */
  const purgeWebhookEvents = Effect.fn('SubscriptionsRepo.purgeWebhookEvents')(function* (
    before: Date,
  ) {
    const rows = yield* db.use((d) =>
      d
        .delete(billingWebhookEvent)
        .where(sql`${billingWebhookEvent.createdAt} < ${before}`)
        .returning({ id: billingWebhookEvent.id }),
    );

    return rows.length;
  });

  return {
    findByFirm,
    startCheckout,
    applyPlanNow,
    cancel,
    claimEvent,
    applyEvent,
    expireLapsed,
    purgeWebhookEvents,
  };
});

export class SubscriptionsRepo extends Context.Service<
  SubscriptionsRepo,
  Effect.Success<typeof make>
>()('competa/api/billing/SubscriptionsRepo') {
  static readonly layerNoDeps = Layer.effect(SubscriptionsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
