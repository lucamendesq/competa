import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { and, eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountant,
  accountingFirm,
  company,
  contact,
  user as authUser,
  userDevice,
} from '../../src/infra/database/schema/index.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';
import { UserDevicesRepo } from '../../src/modules/auth/user-device.repo.js';

let seq = 0;

const seedUser = () =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(authUser)
      .values({ name: `Pessoa ${++seq}`, email: `device-${seq}@example.com` })
      .returning({ id: authUser.id });

    return row.id;
  });

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedCompany = (firmId: string, name: string, active = true) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(company)
      .values({ accountingFirmId: firmId, name, active })
      .returning({ id: company.id });

    return row.id;
  });

const linkContact = (companyId: string, authUserId: string) =>
  Effect.promise(() =>
    db
      .insert(contact)
      .values({
        companyId,
        authUserId,
        name: `Resp ${++seq}`,
        email: `resp-device-${seq}@example.com`,
      })
      .then(() => undefined),
  );

const linkAccountant = (firmId: string, authUserId: string) =>
  Effect.promise(() =>
    db
      .insert(accountant)
      .values({ accountingFirmId: firmId, authUserId })
      .then(() => undefined),
  );

layer(UserDevicesRepo.layer)('UserDevicesRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('upsert cria uma linha por (usuário, dispositivo) e sobrescreve no conflito', () =>
    Effect.gen(function* () {
      const repo = yield* UserDevicesRepo;
      const userId = yield* seedUser();

      yield* repo.upsert({
        userId,
        deviceId: 'device-a',
        platform: 'ios',
        installed: false,
        userAgent: 'Safari',
      });
      yield* repo.upsert({ userId, deviceId: 'device-a', platform: 'ios', installed: true });

      const rows = yield* Effect.promise(() =>
        db
          .select()
          .from(userDevice)
          .where(and(eq(userDevice.userId, userId), eq(userDevice.deviceId, 'device-a'))),
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ installed: true, platform: 'ios', userAgent: null });
    }),
  );

  it.effect('platformStats separa Responsáveis de Contadores e agrega por plataforma', () =>
    Effect.gen(function* () {
      const repo = yield* UserDevicesRepo;
      const scope = yield* seedFirm('Firma Devices');
      const companyId = yield* seedCompany(scope, 'Com Devices');

      const contactUser = yield* seedUser();
      yield* linkContact(companyId, contactUser);
      yield* repo.upsert({
        userId: contactUser,
        deviceId: 'c1',
        platform: 'android',
        installed: true,
      });
      // `user_device_platform_chk` só aceita o vocabulário de DEVICE_PLATFORMS
      yield* repo.upsert({
        userId: contactUser,
        deviceId: 'c2',
        platform: 'other',
        installed: false,
      });

      const accountantUser = yield* seedUser();
      yield* linkAccountant(scope, accountantUser);
      yield* repo.upsert({
        userId: accountantUser,
        deviceId: 'a1',
        platform: 'desktop',
        installed: false,
      });

      const stats = yield* repo.platformStats(scope);

      expect(stats.contacts).toMatchObject({ total: 2, installed: 1 });
      expect(stats.contacts.byPlatform.android).toEqual({ total: 1, installed: 1 });
      expect(stats.contacts.byPlatform.other).toEqual({ total: 1, installed: 0 });
      expect(stats.accountants).toMatchObject({ total: 1, installed: 0 });
      expect(stats.accountants.byPlatform.desktop).toEqual({ total: 1, installed: 0 });
    }),
  );

  /* O escopo é a fronteira: dispositivo de outra Contabilidade não pode aparecer aqui, e
   * Empresa inativa continua contando (o vínculo do Responsável não é desfeito). */
  it.effect('platformStats não enxerga dispositivo de outra Contabilidade', () =>
    Effect.gen(function* () {
      const repo = yield* UserDevicesRepo;
      const scope = yield* seedFirm('Firma A');
      const other = yield* seedFirm('Firma B');
      const otherCompany = yield* seedCompany(other, 'Com B');

      const stranger = yield* seedUser();
      yield* linkContact(otherCompany, stranger);
      yield* repo.upsert({ userId: stranger, deviceId: 'x1', platform: 'ios', installed: true });

      const stats = yield* repo.platformStats(scope);
      expect(stats.contacts.total).toBe(0);
      expect(stats.accountants.total).toBe(0);

      expect((yield* repo.platformStats(other)).contacts.total).toBe(1);
    }),
  );
});
