import { Injectable } from '@nestjs/common';
import { addMonths, addYears } from 'date-fns';
import { eq } from 'drizzle-orm';
import type { BillingCycle, PaidPlanName } from '@competa/contracts';
import { Database } from '../../infra/database/database.js';
import { subscription } from '../../infra/database/schema/index.js';

@Injectable()
export class SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async findByFirm(firmId: string) {
    const [row] = await this.db
      .select()
      .from(subscription)
      .where(eq(subscription.accountingFirmId, firmId))
      .limit(1);

    return row;
  }

  /** Grava o plano e o ciclo escolhidos junto dos ids do gateway. Sem isto a firm pagava o
   *  Profissional e continuava com o teto do trial: o `status` vinha pelo webhook, mas o
   *  `plan_name` nunca saía de onde estava. */
  async startCheckout(input: {
    firmId: string;
    planName: PaidPlanName;
    cycle: BillingCycle;
    gatewayCustomerId: string;
    gatewaySubscriptionId: string;
  }) {
    await this.db
      .update(subscription)
      .set({
        planName: input.planName,
        cycle: input.cycle,
        gatewayCustomerId: input.gatewayCustomerId,
        gatewaySubscriptionId: input.gatewaySubscriptionId,
      })
      .where(eq(subscription.accountingFirmId, input.firmId));
  }

  async updateStatus(gatewaySubscriptionId: string, status: string) {
    const [row] = await this.db
      .select({ cycle: subscription.cycle })
      .from(subscription)
      .where(eq(subscription.gatewaySubscriptionId, gatewaySubscriptionId))
      .limit(1);

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

    await this.db
      .update(subscription)
      .set({ status, ...period })
      .where(eq(subscription.gatewaySubscriptionId, gatewaySubscriptionId));
  }
}
