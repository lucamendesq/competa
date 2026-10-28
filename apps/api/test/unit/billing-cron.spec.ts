import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import { accountingFirm, subscription } from '../../src/infra/database/schema/index.js';
import { BillingSweep } from '../../src/modules/billing/billing.cron.js';
import { SubscriptionsRepo } from '../../src/modules/billing/subscription.repo.js';
import { RequestsRepo } from '../../src/modules/requests/request.repo.js';

const TestLayer = BillingSweep.layer.pipe(
  Layer.provide(Layer.mergeAll(RequestsRepo.layer, SubscriptionsRepo.layer)),
);

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const seed = (label: string, values: Partial<typeof subscription.$inferInsert>) =>
  Effect.promise(async () => {
    const [firm] = await db
      .insert(accountingFirm)
      .values({ name: `Contabilidade ${label}` })
      .returning({ id: accountingFirm.id });
    await db.insert(subscription).values({ accountingFirmId: firm.id, ...values });
    return firm.id;
  });

const statusOf = (firmId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select({ status: subscription.status })
      .from(subscription)
      .where(eq(subscription.accountingFirmId, firmId));
    return row.status;
  });

/* A fila do Asaas pausa depois de 15 falhas seguidas; sem o webhook a firma ficava ACTIVE
 * para sempre. A varredura diária lê o período e fecha o que venceu há mais de 7 dias. */
layer(TestLayer)('BillingSweep.daily', (it) => {
  beforeAll(() => truncateAll());

  it.effect('fecha a assinatura vencida além da carência e deixa as outras', () =>
    Effect.gen(function* () {
      const sweep = yield* BillingSweep;
      const lapsed = yield* seed('vencida', {
        status: 'ACTIVE',
        currentPeriodEnd: day('2020-01-01'),
      });
      const alive = yield* seed('viva', {
        status: 'ACTIVE',
        currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      });
      const trialing = yield* seed('trial', { status: 'trialing' });

      yield* sweep.daily();

      expect(yield* statusOf(lapsed)).toBe('OVERDUE');
      expect(yield* statusOf(alive)).toBe('ACTIVE');
      expect(yield* statusOf(trialing)).toBe('trialing');
    }),
  );
});
