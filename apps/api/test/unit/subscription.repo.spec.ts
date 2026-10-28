import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { addMonths, addYears } from 'date-fns';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import { accountingFirm, subscription } from '../../src/infra/database/schema/index.js';
import { SubscriptionsRepo } from '../../src/modules/billing/subscription.repo.js';

let seq = 0;
const next = () => ++seq;

const seedFirm = (label: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name: `Contabilidade ${label} ${next()}` })
      .returning({ id: accountingFirm.id });

    return row.id;
  });

const seedSubscription = (
  firmId: string,
  overrides: {
    cycle?: string;
    planName?: string;
    status?: string;
    gatewaySubscriptionId?: string;
  } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(subscription)
      .values({
        accountingFirmId: firmId,
        planName: overrides.planName ?? 'trial',
        cycle: overrides.cycle ?? 'monthly',
        status: overrides.status ?? 'trialing',
        gatewaySubscriptionId: overrides.gatewaySubscriptionId ?? null,
      })
      .returning({ id: subscription.id });

    return row.id;
  });

const subscriptionRow = (firmId: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .select()
      .from(subscription)
      .where(eq(subscription.accountingFirmId, firmId))
      .limit(1);

    return row;
  });

layer(SubscriptionsRepo.layer)('SubscriptionsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('findByFirm: devolve a assinatura da firma e undefined sem linha', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('find');
      const bare = yield* seedFirm('semassinatura');
      yield* seedSubscription(firm, { planName: 'essencial', status: 'ACTIVE' });

      expect(yield* repo.findByFirm(firm)).toMatchObject({
        accountingFirmId: firm,
        planName: 'essencial',
        status: 'ACTIVE',
      });

      expect(yield* repo.findByFirm(bare)).toBeUndefined();
      expect(yield* repo.findByFirm('00000000-0000-7000-8000-000000000000')).toBeUndefined();
    }),
  );

  it.effect('startCheckout: grava plano, ciclo e ids do gateway sem tocar no status', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('checkout');
      yield* seedSubscription(firm, { status: 'trialing' });

      yield* repo.startCheckout({
        firmId: firm,
        planName: 'profissional',
        cycle: 'yearly',
        gatewayCustomerId: 'cus_checkout',
        gatewaySubscriptionId: 'sub_checkout',
      });

      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'profissional',
        cycle: 'yearly',
        gatewayCustomerId: 'cus_checkout',
        gatewaySubscriptionId: 'sub_checkout',
        status: 'trialing',
      });
    }),
  );

  /** Bug congelado #20: `startCheckout` é UPDATE sem upsert — firma sem linha de assinatura
   *  passa sem erro e nada é gravado. */
  it.effect('startCheckout: firma sem linha de assinatura é no-op silencioso', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('checkoutsemlinha');

      yield* repo.startCheckout({
        firmId: firm,
        planName: 'essencial',
        cycle: 'monthly',
        gatewayCustomerId: 'cus_fantasma',
        gatewaySubscriptionId: 'sub_fantasma',
      });

      expect(yield* subscriptionRow(firm)).toBeUndefined();
    }),
  );

  it.effect('updateStatus: ACTIVE abre o período do ciclo (mensal +1 mês, anual +1 ano)', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const monthly = yield* seedFirm('ativomensal');
      const yearly = yield* seedFirm('ativoanual');
      yield* seedSubscription(monthly, { cycle: 'monthly', gatewaySubscriptionId: 'sub_mensal' });
      yield* seedSubscription(yearly, { cycle: 'yearly', gatewaySubscriptionId: 'sub_anual' });

      yield* repo.updateStatus('sub_mensal', 'ACTIVE');
      const monthlyRow = yield* subscriptionRow(monthly);
      expect(monthlyRow.status).toBe('ACTIVE');
      expect(monthlyRow.currentPeriodEnd!.getTime()).toBeCloseTo(
        addMonths(monthlyRow.currentPeriodStart!, 1).getTime(),
        -3,
      );

      yield* repo.updateStatus('sub_anual', 'ACTIVE');
      const yearlyRow = yield* subscriptionRow(yearly);
      expect(yearlyRow.status).toBe('ACTIVE');
      expect(yearlyRow.currentPeriodEnd!.getTime()).toBeCloseTo(
        addYears(yearlyRow.currentPeriodStart!, 1).getTime(),
        -3,
      );
    }),
  );

  it.effect('updateStatus: status não-ACTIVE preserva o período e id desconhecido é no-op', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('inadimplente');
      const untouched = yield* seedFirm('intocada');
      yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_overdue' });
      yield* seedSubscription(untouched, { gatewaySubscriptionId: 'sub_intocada' });

      yield* repo.updateStatus('sub_overdue', 'ACTIVE');
      const activated = yield* subscriptionRow(firm);

      yield* repo.updateStatus('sub_overdue', 'OVERDUE');
      const overdue = yield* subscriptionRow(firm);
      expect(overdue.status).toBe('OVERDUE');
      expect(overdue.currentPeriodStart).toEqual(activated.currentPeriodStart);
      expect(overdue.currentPeriodEnd).toEqual(activated.currentPeriodEnd);

      yield* repo.updateStatus('sub_que_nao_existe', 'CANCELED');
      expect(yield* subscriptionRow(untouched)).toMatchObject({
        status: 'trialing',
        currentPeriodStart: null,
      });
    }),
  );
});
