import { Context, Effect, Layer } from 'effect';
import { subDays } from 'date-fns';
import { Logger } from '../../lib/logger.js';
import { RequestsRepo } from '../requests/request.repo.js';
import { SubscriptionsRepo } from './subscription.repo.js';

const BILLING_CRON_LEASE = 'billing-sweep';

/** Dias depois do fim do período em que a firma ACTIVE sem fatura paga vira OVERDUE. Cobre
 *  o boleto pago no vencimento e compensado dias depois. */
export const LAPSE_GRACE_DAYS = 7;

/** O Asaas reenvia um evento por no máximo 14 dias; depois disso a linha só ocupa espaço. */
export const WEBHOOK_EVENT_RETENTION_DAYS = 30;

const logger = new Logger('BillingCron');

/** Reconciliação diária: a fila do Asaas pausa depois de 15 falhas seguidas, e um webhook
 *  que não chega deixava a firma ACTIVE para sempre. A varredura lê `current_period_end`
 *  em vez de esperar pelo gateway. */
const make = Effect.gen(function* () {
  const requests = yield* RequestsRepo;
  const subscriptions = yield* SubscriptionsRepo;

  const daily = () =>
    Effect.gen(function* () {
      const ran = yield* requests.withLease(
        BILLING_CRON_LEASE,
        Effect.gen(function* () {
          const now = new Date();
          const lapsed = yield* subscriptions.expireLapsed(now, LAPSE_GRACE_DAYS);
          const purged = yield* subscriptions.purgeWebhookEvents(
            subDays(now, WEBHOOK_EVENT_RETENTION_DAYS),
          );

          logger.log(
            `cobrança: ${lapsed.length} assinatura(s) com período vencido → OVERDUE; ${purged} evento(s) de webhook expurgado(s)`,
          );
          return true;
        }),
      );

      if (!ran) logger.warn('cobrança: varredura pulada — lock tomado por outra instância');
    });

  return { daily };
});

export class BillingSweep extends Context.Service<BillingSweep, Effect.Success<typeof make>>()(
  'competa/api/billing/BillingSweep',
) {
  static readonly layer = Layer.effect(BillingSweep, make);
}
