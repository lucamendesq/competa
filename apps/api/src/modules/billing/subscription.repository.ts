import { Injectable } from '@nestjs/common';
import type { BillingCycle, PaidPlanName } from '@competa/contracts';
import { run } from '../../effect/runtime.js';
import { SubscriptionsRepo } from './subscription.repo.js';

/** Casca Nest sobre o serviço Effect (`subscription.repo.ts`): mantém a DI dos controllers e
 *  dos scripts de verificação até cada consumidor migrar; morre na fase final. */
@Injectable()
export class SubscriptionRepository {
  findByFirm(firmId: string) {
    return run(SubscriptionsRepo.use((repo) => repo.findByFirm(firmId)));
  }

  startCheckout(input: {
    firmId: string;
    planName: PaidPlanName;
    cycle: BillingCycle;
    gatewayCustomerId: string;
    gatewaySubscriptionId: string;
  }) {
    return run(SubscriptionsRepo.use((repo) => repo.startCheckout(input)));
  }

  updateStatus(gatewaySubscriptionId: string, status: string) {
    return run(SubscriptionsRepo.use((repo) => repo.updateStatus(gatewaySubscriptionId, status)));
  }
}
