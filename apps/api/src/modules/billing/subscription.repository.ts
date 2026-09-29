import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { subscription } from '../../infra/database/schema/index.js';

@Injectable()
export class SubscriptionRepository {
  constructor(private readonly db: Database) {}

  async updateGatewayData(
    firmId: string, 
    gatewayCustomerId: string, 
    gatewaySubscriptionId: string
  ) {
    await this.db
      .update(subscription)
      .set({ gatewayCustomerId, gatewaySubscriptionId })
      .where(eq(subscription.accountingFirmId, firmId));
  }

  async updateStatus(
    gatewaySubscriptionId: string, 
    status: string,
    currentPeriodStart?: Date,
    currentPeriodEnd?: Date
  ) {
    await this.db
      .update(subscription)
      .set({ 
        status, 
        currentPeriodStart, 
        currentPeriodEnd 
      })
      .where(eq(subscription.gatewaySubscriptionId, gatewaySubscriptionId));
  }
}
