import { Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type {
  AudienceDeviceStats,
  DevicePlatform,
  DeviceStatsResponse,
} from '@competa/contracts';
import { Database } from '../../infra/database/database.js';
import { accountant, company, contact, userDevice } from '../../infra/database/schema/index.js';
import type { FirmScope } from './scope.js';

const emptyAudienceStats = (): AudienceDeviceStats => ({
  total: 0,
  installed: 0,
  byPlatform: {
    ios: { total: 0, installed: 0 },
    android: { total: 0, installed: 0 },
    desktop: { total: 0, installed: 0 },
    other: { total: 0, installed: 0 },
  },
});

const aggregateAudience = (
  rows: { platform: string; installed: boolean }[],
): AudienceDeviceStats => {
  const result = emptyAudienceStats();
  result.total = rows.length;

  for (const row of rows) {
    if (row.installed) result.installed++;

    const platformKey = (
      row.platform in result.byPlatform ? row.platform : 'other'
    ) as DevicePlatform;
    result.byPlatform[platformKey].total++;
    if (row.installed) {
      result.byPlatform[platformKey].installed++;
    }
  }

  return result;
};

@Injectable()
export class UserDeviceRepository {
  constructor(private readonly db: Database) { }

  async upsert(data: {
    userId: string;
    deviceId: string;
    platform: string;
    installed: boolean;
    userAgent?: string | null;
  }) {
    await this.db
      .insert(userDevice)
      .values({
        userId: data.userId,
        deviceId: data.deviceId,
        platform: data.platform,
        installed: data.installed,
        userAgent: data.userAgent ?? null,
      })
      .onConflictDoUpdate({
        target: [userDevice.userId, userDevice.deviceId],
        set: {
          platform: data.platform,
          installed: data.installed,
          userAgent: data.userAgent ?? null,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      });
  }

  async platformStats(scope: FirmScope): Promise<DeviceStatsResponse> {
    const contactUserIds = this.db
      .selectDistinct({ userId: contact.authUserId })
      .from(contact)
      .innerJoin(company, eq(company.id, contact.companyId))
      .where(and(eq(company.accountingFirmId, scope), isNotNull(contact.authUserId)));

    const accountantUserIds = this.db
      .select({ userId: accountant.authUserId })
      .from(accountant)
      .where(eq(accountant.accountingFirmId, scope));

    const [contactRows, accountantRows] = await Promise.all([
      this.db
        .select({
          platform: userDevice.platform,
          installed: userDevice.installed,
        })
        .from(userDevice)
        .where(inArray(userDevice.userId, contactUserIds)),
      this.db
        .select({
          platform: userDevice.platform,
          installed: userDevice.installed,
        })
        .from(userDevice)
        .where(inArray(userDevice.userId, accountantUserIds)),
    ]);

    return {
      contacts: aggregateAudience(contactRows),
      accountants: aggregateAudience(accountantRows),
    };
  }
}
