import { Context, Effect, Layer } from 'effect';
import { addMonths, addYears } from 'date-fns';
import { eq } from 'drizzle-orm';
import type { BillingCycle, PaidPlanName } from '@competa/contracts';
import { Db } from '../../infra/database/effect.js';
import { subscription } from '../../infra/database/schema/index.js';

const make = Effect.gen(function* () {
  const db = yield* Db;

  const findByFirm = Effect.fn('SubscriptionsRepo.findByFirm')(function* (firmId: string) {
    const [row] = yield* db.use((d) =>
      d.select().from(subscription).where(eq(subscription.accountingFirmId, firmId)).limit(1),
    );

    return row;
  });

  /** Grava o plano e o ciclo escolhidos junto dos ids do gateway. Sem isto a firm pagava o
   *  Profissional e continuava com o teto do trial: o `status` vinha pelo webhook, mas o
   *  `plan_name` nunca saía de onde estava. */
  const startCheckout = Effect.fn('SubscriptionsRepo.startCheckout')(function* (input: {
    firmId: string;
    planName: PaidPlanName;
    cycle: BillingCycle;
    gatewayCustomerId: string;
    gatewaySubscriptionId: string;
  }) {
    yield* db.use((d) =>
      d
        .update(subscription)
        .set({
          planName: input.planName,
          cycle: input.cycle,
          gatewayCustomerId: input.gatewayCustomerId,
          gatewaySubscriptionId: input.gatewaySubscriptionId,
        })
        .where(eq(subscription.accountingFirmId, input.firmId)),
    );
  });

  const updateStatus = Effect.fn('SubscriptionsRepo.updateStatus')(function* (
    gatewaySubscriptionId: string,
    status: string,
  ) {
    const [row] = yield* db.use((d) =>
      d
        .select({ cycle: subscription.cycle })
        .from(subscription)
        .where(eq(subscription.gatewaySubscriptionId, gatewaySubscriptionId))
        .limit(1),
    );

    /* Pagamento confirmado abre o período inteiro do ciclo: no anual a próxima cobrança é
     * daqui a 12 meses, e a régua de inadimplência não tem o que procurar no mês 2. */
    const period =
      status === 'ACTIVE'
        ? (() => {
            const start = new Date();
            return {
              currentPeriodStart: start,
              currentPeriodEnd: row?.cycle === 'yearly' ? addYears(start, 1) : addMonths(start, 1),
            };
          })()
        : {};

    yield* db.use((d) =>
      d
        .update(subscription)
        .set({ status, ...period })
        .where(eq(subscription.gatewaySubscriptionId, gatewaySubscriptionId)),
    );
  });

  return { findByFirm, startCheckout, updateStatus };
});

export class SubscriptionsRepo extends Context.Service<
  SubscriptionsRepo,
  Effect.Success<typeof make>
>()('competa/api/billing/SubscriptionsRepo') {
  static readonly layerNoDeps = Layer.effect(SubscriptionsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
