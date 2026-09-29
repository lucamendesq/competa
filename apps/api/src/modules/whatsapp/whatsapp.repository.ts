import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  whatsappIntegration,
  accountingFirm,
  period,
  request,
  message,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';

@Injectable()
export class WhatsappRepository {
  constructor(private readonly db: Database) {}

  async getIntegrationByFirm(scope: FirmScope) {
    const [row] = await this.db
      .select()
      .from(whatsappIntegration)
      .where(eq(whatsappIntegration.accountingFirmId, scope))
      .limit(1);
    return row;
  }

  async getIntegrationByRequestId(requestId: string) {
    const [row] = await this.db
      .select({
        accessToken: whatsappIntegration.accessToken,
        phoneNumberId: whatsappIntegration.phoneNumberId,
        status: whatsappIntegration.status,
      })
      .from(whatsappIntegration)
      .innerJoin(accountingFirm, eq(accountingFirm.id, whatsappIntegration.accountingFirmId))
      .innerJoin(period, eq(period.accountingFirmId, accountingFirm.id))
      .innerJoin(request, eq(request.periodId, period.id))
      .where(eq(request.id, requestId))
      .limit(1);
    return row;
  }

  async upsertIntegration(
    scope: FirmScope,
    data: {
      wabaId: string;
      phoneNumberId: string;
      displayPhoneNumber: string;
      accessToken: string;
    },
  ) {
    await this.db
      .insert(whatsappIntegration)
      .values({
        accountingFirmId: scope,
        wabaId: data.wabaId,
        phoneNumberId: data.phoneNumberId,
        displayPhoneNumber: data.displayPhoneNumber,
        accessToken: data.accessToken,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: whatsappIntegration.accountingFirmId,
        set: {
          wabaId: data.wabaId,
          phoneNumberId: data.phoneNumberId,
          displayPhoneNumber: data.displayPhoneNumber,
          accessToken: data.accessToken,
          status: 'active',
        },
      });
  }

  async deleteIntegration(scope: FirmScope) {
    await this.db
      .delete(whatsappIntegration)
      .where(eq(whatsappIntegration.accountingFirmId, scope));
  }

  async getIntegrationByTenantId(tenantId: string) {
    const [row] = await this.db
      .select()
      .from(whatsappIntegration)
      .where(eq(whatsappIntegration.accountingFirmId, tenantId))
      .limit(1);
    return row;
  }

  async updateMessageDeliveryStatus(
    metaMessageId: string,
    payload: { status: 'delivered' | 'read' | 'failed'; error?: string; date?: Date },
  ) {
    const at = payload.date ?? new Date();
    if (payload.status === 'delivered') {
      await this.db
        .update(message)
        .set({ deliveredAt: at })
        .where(eq(message.metaMessageId, metaMessageId));
    } else if (payload.status === 'read') {
      await this.db
        .update(message)
        .set({ readAt: at })
        .where(eq(message.metaMessageId, metaMessageId));
    } else if (payload.status === 'failed') {
      await this.db
        .update(message)
        .set({ status: 'failed', error: payload.error ?? 'Unknown error' })
        .where(eq(message.metaMessageId, metaMessageId));
    }
  }
}
