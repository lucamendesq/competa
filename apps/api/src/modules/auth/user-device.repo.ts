import { Context, Effect, Layer } from 'effect';
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { AudienceDeviceStats, DevicePlatform, DeviceStatsResponse } from '@competa/contracts';
import { Db } from '../../infra/database/effect.js';
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

const make = Effect.gen(function* () {
  const db = yield* Db;

  const upsert = Effect.fn('UserDevicesRepo.upsert')(function* (data: {
    userId: string;
    deviceId: string;
    platform: string;
    installed: boolean;
    userAgent?: string | null;
  }) {
    yield* db.use((d) =>
      d
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
        }),
    );
  });

  const platformStats = Effect.fn('UserDevicesRepo.platformStats')(function* (scope: FirmScope) {
    const { contactRows, accountantRows } = yield* db.use(async (d) => {
      const contactUserIds = d
        .selectDistinct({ userId: contact.authUserId })
        .from(contact)
        .innerJoin(company, eq(company.id, contact.companyId))
        .where(and(eq(company.accountingFirmId, scope), isNotNull(contact.authUserId)));

      const accountantUserIds = d
        .select({ userId: accountant.authUserId })
        .from(accountant)
        .where(eq(accountant.accountingFirmId, scope));

      const [contacts, accountants] = await Promise.all([
        d
          .select({ platform: userDevice.platform, installed: userDevice.installed })
          .from(userDevice)
          .where(inArray(userDevice.userId, contactUserIds)),
        d
          .select({ platform: userDevice.platform, installed: userDevice.installed })
          .from(userDevice)
          .where(inArray(userDevice.userId, accountantUserIds)),
      ]);

      return { contactRows: contacts, accountantRows: accountants };
    });

    return {
      contacts: aggregateAudience(contactRows),
      accountants: aggregateAudience(accountantRows),
    } satisfies DeviceStatsResponse;
  });

  return { upsert, platformStats };
});

export class UserDevicesRepo extends Context.Service<
  UserDevicesRepo,
  Effect.Success<typeof make>
>()('competa/api/auth/UserDevicesRepo') {
  static readonly layerNoDeps = Layer.effect(UserDevicesRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
