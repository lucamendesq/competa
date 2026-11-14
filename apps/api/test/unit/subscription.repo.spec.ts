import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import { Db } from '../../src/infra/database/effect.js';
import { accountingFirm, subscription } from '../../src/infra/database/schema/index.js';
import { PLANS, planPrice } from '@competa/contracts';
import { GatewayUnavailable } from '../../src/modules/billing/errors.js';
import {
  SubscriptionsRepo,
  type GatewayReprice,
  type WebhookEvent,
} from '../../src/modules/billing/subscription.repo.js';

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
  overrides: Partial<typeof subscription.$inferInsert> = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(subscription)
      .values({
        accountingFirmId: firmId,
        planName: 'trial',
        cycle: 'monthly',
        status: 'trialing',
        ...overrides,
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

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

const event = (
  gatewaySubscriptionId: string | null,
  name: string,
  payment: WebhookEvent['payment'] = {},
  externalReference: string | null = null,
): WebhookEvent => ({
  eventId: `evt_${next()}_${Date.now()}`,
  event: name,
  gatewaySubscriptionId,
  externalReference,
  payment,
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

  /* O gate de capability lê `planName`. Se o checkout o gravasse, o plano pago valeria do
   * clique até o estorno — a escolha fica como intenção e só o pagamento a promove. */
  it.effect(
    'startCheckout: grava INTENÇÃO e fatura; plano, ciclo e status ficam como estavam',
    () =>
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
          pendingPaymentId: 'pay_checkout',
          pendingInvoiceUrl: 'https://asaas.example/i/pay_checkout',
        });

        expect(yield* subscriptionRow(firm)).toMatchObject({
          pendingPlanName: 'profissional',
          pendingCycle: 'yearly',
          pendingPaymentId: 'pay_checkout',
          pendingInvoiceUrl: 'https://asaas.example/i/pay_checkout',
          planName: 'trial',
          cycle: 'monthly',
          gatewayCustomerId: 'cus_checkout',
          gatewaySubscriptionId: 'sub_checkout',
          previousGatewaySubscriptionIds: [],
          status: 'trialing',
        });
      }),
  );

  /* A cobrança da assinatura substituída continua pagável no Asaas; se o id sumisse da
   * linha, o pagamento dela seria dinheiro recebido sem ativação. */
  it.effect(
    'startCheckout: assinatura trocada vai para o histórico, e o webhook a acha por ele',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('historico');
        yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_antiga' });

        const checkout = (gatewaySubscriptionId: string) =>
          repo.startCheckout({
            firmId: firm,
            planName: 'essencial',
            cycle: 'monthly',
            gatewayCustomerId: 'cus_h',
            gatewaySubscriptionId,
            pendingPaymentId: null,
            pendingInvoiceUrl: null,
          });

        yield* checkout('sub_nova');
        yield* checkout('sub_nova');
        yield* checkout('sub_mais_nova');

        expect(yield* subscriptionRow(firm)).toMatchObject({
          gatewaySubscriptionId: 'sub_mais_nova',
          previousGatewaySubscriptionIds: ['sub_antiga', 'sub_nova'],
        });

        const applied = yield* repo.applyEvent(
          event('sub_antiga', 'PAYMENT_RECEIVED', { value: 119, dueDate: day('2026-10-01') }),
        );
        expect(applied).toMatchObject({ outcome: 'applied', status: 'ACTIVE' });
        expect((yield* subscriptionRow(firm)).status).toBe('ACTIVE');
      }),
  );

  /* O Asaas reenvia em qualquer resposta não-2xx e pode repetir uma entrega bem-sucedida.
   * Sem a reivindicação, um `PAYMENT_RECEIVED` repetido reabriria o período de cobrança a
   * partir do novo `now()` — o cliente ganharia tempo de assinatura de graça. */
  it.effect('claimEvent: o primeiro leva; reenvio do mesmo evento não', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const eventId = `evt_${next()}_${Date.now()}`;

      expect(yield* repo.claimEvent(eventId, 'PAYMENT_RECEIVED')).toBe(true);
      expect(yield* repo.claimEvent(eventId, 'PAYMENT_RECEIVED')).toBe(false);
      expect(yield* repo.claimEvent(`${eventId}-outro`, 'PAYMENT_OVERDUE')).toBe(true);
    }),
  );

  it.effect('applyEvent: reenvio do mesmo id é duplicate e não mexe na linha', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('duplicado');
      yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_dup' });

      const first = event('sub_dup', 'PAYMENT_CONFIRMED', { dueDate: day('2026-10-05') });
      expect(yield* repo.applyEvent(first)).toMatchObject({ outcome: 'applied' });
      const activated = yield* subscriptionRow(firm);

      yield* Effect.promise(() =>
        db.update(subscription).set({ status: 'OVERDUE' }).where(eq(subscription.id, activated.id)),
      );
      expect(yield* repo.applyEvent(first)).toEqual({ outcome: 'duplicate' });
      expect((yield* subscriptionRow(firm)).status).toBe('OVERDUE');
    }),
  );

  it.effect('applyEvent ACTIVE promove a intenção quando o pagamento é DA fatura pendente', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('promove');
      yield* seedSubscription(firm, { status: 'trialing', gatewaySubscriptionId: 'sub_promove' });

      yield* repo.startCheckout({
        firmId: firm,
        planName: 'escritorio',
        cycle: 'yearly',
        gatewayCustomerId: 'cus_promove',
        gatewaySubscriptionId: 'sub_promove',
        pendingPaymentId: 'pay_promove',
        pendingInvoiceUrl: 'https://asaas.example/i/pay_promove',
      });

      /* A fatura antiga do plano anterior chega atrasada: ativa, mas não promove. */
      const stale = yield* repo.applyEvent(
        event('sub_promove', 'PAYMENT_RECEIVED', { id: 'pay_antiga', dueDate: day('2026-09-01') }),
      );
      expect(stale).toMatchObject({ outcome: 'applied', status: 'ACTIVE', promoted: false });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'trial',
        pendingPlanName: 'escritorio',
        pendingPaymentId: 'pay_promove',
      });

      const paid = yield* repo.applyEvent(
        event('sub_promove', 'PAYMENT_CONFIRMED', {
          id: 'pay_promove',
          dueDate: day('2026-10-10'),
        }),
      );
      expect(paid).toMatchObject({ outcome: 'applied', status: 'ACTIVE', promoted: true });

      const row = yield* subscriptionRow(firm);
      expect(row).toMatchObject({
        planName: 'escritorio',
        cycle: 'yearly',
        status: 'ACTIVE',
        pendingPlanName: null,
        pendingCycle: null,
        pendingPaymentId: null,
        pendingInvoiceUrl: null,
      });

      /* O período segue o ciclo PROMOVIDO (anual) e ancora no vencimento da fatura. */
      expect(row.currentPeriodStart).toEqual(day('2026-10-10'));
      expect(row.currentPeriodEnd).toEqual(day('2027-10-10'));
    }),
  );

  /* Checkout anterior a esta regra não tem o id da fatura: vale o valor. */
  it.effect(
    'applyEvent: sem id da fatura gravado, promove só se o valor cobre o plano pendente',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('valor');
        yield* seedSubscription(firm, {
          gatewaySubscriptionId: 'sub_valor',
          pendingPlanName: 'profissional',
          pendingCycle: 'monthly',
          priceOverride: { profissional: 139 },
        });

        yield* repo.applyEvent(event('sub_valor', 'PAYMENT_CONFIRMED', { value: 119 }));
        expect((yield* subscriptionRow(firm)).planName).toBe('trial');

        yield* repo.applyEvent(event('sub_valor', 'PAYMENT_CONFIRMED', { value: 139 }));
        expect((yield* subscriptionRow(firm)).planName).toBe('profissional');
      }),
  );

  it.effect(
    'applyEvent: período mensal +1 mês, anual +1 ano, ancorado no vencimento; só anda para a frente',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const monthly = yield* seedFirm('ativomensal');
        const yearly = yield* seedFirm('ativoanual');
        yield* seedSubscription(monthly, { cycle: 'monthly', gatewaySubscriptionId: 'sub_mensal' });
        yield* seedSubscription(yearly, { cycle: 'yearly', gatewaySubscriptionId: 'sub_anual' });

        yield* repo.applyEvent(
          event('sub_mensal', 'PAYMENT_RECEIVED', { dueDate: day('2026-11-01') }),
        );
        const monthlyRow = yield* subscriptionRow(monthly);
        expect(monthlyRow.status).toBe('ACTIVE');
        expect(monthlyRow.currentPeriodStart).toEqual(day('2026-11-01'));
        expect(monthlyRow.currentPeriodEnd).toEqual(day('2026-12-01'));

        /* Fatura antiga paga depois: ativa, mas o período já aberto não encolhe. */
        yield* repo.applyEvent(
          event('sub_mensal', 'PAYMENT_RECEIVED', { dueDate: day('2026-10-01') }),
        );
        expect((yield* subscriptionRow(monthly)).currentPeriodEnd).toEqual(day('2026-12-01'));

        yield* repo.applyEvent(
          event('sub_anual', 'PAYMENT_RECEIVED', { dueDate: day('2026-11-01') }),
        );
        const yearlyRow = yield* subscriptionRow(yearly);
        expect(yearlyRow.currentPeriodEnd).toEqual(day('2027-11-01'));

        /* Sem data no payload, a âncora é agora. */
        const bare = yield* seedFirm('semdata');
        yield* seedSubscription(bare, { gatewaySubscriptionId: 'sub_semdata' });
        yield* repo.applyEvent(event('sub_semdata', 'PAYMENT_RECEIVED'));
        const bareRow = yield* subscriptionRow(bare);
        expect(Math.abs(bareRow.currentPeriodStart!.getTime() - Date.now())).toBeLessThan(5_000);
      }),
  );

  it.effect(
    'applyEvent OVERDUE: fatura do período corrente derruba; fatura antiga é ignorada',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('inadimplente');
        yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_overdue' });

        yield* repo.applyEvent(
          event('sub_overdue', 'PAYMENT_RECEIVED', { dueDate: day('2026-11-01') }),
        );
        const activated = yield* subscriptionRow(firm);

        const old = yield* repo.applyEvent(
          event('sub_overdue', 'PAYMENT_DELETED', { dueDate: day('2026-10-01') }),
        );
        expect(old).toEqual({ outcome: 'ignored', reason: 'stale' });
        expect((yield* subscriptionRow(firm)).status).toBe('ACTIVE');

        const current = yield* repo.applyEvent(
          event('sub_overdue', 'PAYMENT_OVERDUE', { dueDate: day('2026-12-01') }),
        );
        expect(current).toMatchObject({ outcome: 'applied', status: 'OVERDUE' });
        const overdue = yield* subscriptionRow(firm);
        expect(overdue.status).toBe('OVERDUE');
        expect(overdue.currentPeriodStart).toEqual(activated.currentPeriodStart);
        expect(overdue.currentPeriodEnd).toEqual(activated.currentPeriodEnd);
      }),
  );

  it.effect('applyEvent: OVERDUE da fatura já paga chegando depois do CONFIRMED não bloqueia', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('overdueatrasado');
      yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_oa', status: 'ACTIVE' });

      yield* repo.applyEvent(
        event('sub_oa', 'PAYMENT_CONFIRMED', { id: 'pay_oa', dueDate: day('2026-11-10') }),
      );
      const late = yield* repo.applyEvent(
        event('sub_oa', 'PAYMENT_OVERDUE', { id: 'pay_oa', dueDate: day('2026-11-10') }),
      );

      expect(late).toEqual({ outcome: 'ignored', reason: 'stale' });
      expect((yield* subscriptionRow(firm)).status).toBe('ACTIVE');
    }),
  );

  it.effect(
    'applyEvent: OVERDUE pela fatura N+1, o RECEIVED tardio da N não reativa; pagar a N+1 reativa',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('receivedtardio');
        yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_rt', status: 'ACTIVE' });

        yield* repo.applyEvent(
          event('sub_rt', 'PAYMENT_CONFIRMED', { id: 'pay_n', dueDate: day('2026-10-10') }),
        );
        yield* repo.applyEvent(
          event('sub_rt', 'PAYMENT_OVERDUE', { id: 'pay_n1', dueDate: day('2026-11-10') }),
        );
        expect((yield* subscriptionRow(firm)).status).toBe('OVERDUE');

        const late = yield* repo.applyEvent(
          event('sub_rt', 'PAYMENT_RECEIVED', { id: 'pay_n', dueDate: day('2026-10-10') }),
        );
        expect(late).toEqual({ outcome: 'ignored', reason: 'stale' });
        expect((yield* subscriptionRow(firm)).status).toBe('OVERDUE');

        const paid = yield* repo.applyEvent(
          event('sub_rt', 'PAYMENT_RECEIVED', { id: 'pay_n1', dueDate: day('2026-11-10') }),
        );
        expect(paid).toMatchObject({ outcome: 'applied', status: 'ACTIVE' });
        expect(yield* subscriptionRow(firm)).toMatchObject({
          status: 'ACTIVE',
          currentPeriodStart: day('2026-11-10'),
          currentPeriodEnd: day('2026-12-10'),
        });
      }),
  );

  it.effect(
    'applyEvent: SUBSCRIPTION_INACTIVATED/DELETED cancelam e limpam a intenção; cancelada não reativa',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('cancelada');
        yield* seedSubscription(firm, {
          gatewaySubscriptionId: 'sub_cancel',
          status: 'ACTIVE',
          pendingPlanName: 'profissional',
          pendingPaymentId: 'pay_x',
        });

        const canceled = yield* repo.applyEvent(event('sub_cancel', 'SUBSCRIPTION_INACTIVATED'));
        expect(canceled).toMatchObject({ outcome: 'applied', status: 'CANCELED' });
        expect(yield* subscriptionRow(firm)).toMatchObject({
          status: 'CANCELED',
          pendingPlanName: null,
          pendingPaymentId: null,
        });

        const late = yield* repo.applyEvent(
          event('sub_cancel', 'PAYMENT_RECEIVED', { id: 'pay_x' }),
        );
        expect(late).toEqual({ outcome: 'ignored', reason: 'canceled' });
        expect((yield* subscriptionRow(firm)).status).toBe('CANCELED');
      }),
  );

  it.effect(
    'applyEvent: evento que tira acesso só vale para a assinatura atual, não para a substituída',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('substituida');
        yield* seedSubscription(firm, {
          gatewaySubscriptionId: 'sub_nova',
          previousGatewaySubscriptionIds: ['sub_velha'],
          status: 'ACTIVE',
        });

        expect(yield* repo.applyEvent(event('sub_velha', 'SUBSCRIPTION_INACTIVATED'))).toEqual({
          outcome: 'ignored',
          reason: 'stale',
        });
        expect(yield* repo.applyEvent(event('sub_velha', 'PAYMENT_DELETED'))).toEqual({
          outcome: 'ignored',
          reason: 'stale',
        });
        expect((yield* subscriptionRow(firm)).status).toBe('ACTIVE');

        /* Pagamento da substituída continua valendo: dinheiro é dinheiro. */
        expect(yield* repo.applyEvent(event('sub_velha', 'PAYMENT_RECEIVED'))).toMatchObject({
          outcome: 'applied',
          status: 'ACTIVE',
        });
      }),
  );

  it.effect('applyEvent: cancelada não vira OVERDUE pelas cobranças apagadas junto', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('canceladapaga');
      yield* seedSubscription(firm, {
        gatewaySubscriptionId: 'sub_cp',
        status: 'CANCELED',
        currentPeriodStart: day('2026-10-01'),
        currentPeriodEnd: day('2026-11-01'),
      });

      const deleted = yield* repo.applyEvent(
        event('sub_cp', 'PAYMENT_DELETED', { dueDate: day('2026-11-01') }),
      );
      expect(deleted).toEqual({ outcome: 'ignored', reason: 'canceled' });
      expect((yield* subscriptionRow(firm)).status).toBe('CANCELED');
    }),
  );

  it.effect(
    'applyEvent: fatura vencida do checkout antecipado não encurta o trial; trial acabado vale',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const live = yield* seedFirm('trialvivo');
        yield* seedSubscription(live, {
          gatewaySubscriptionId: 'sub_trial',
          trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
          pendingPlanName: 'profissional',
          pendingPaymentId: 'pay_trial',
        });

        const lapsed = yield* repo.applyEvent(event('sub_trial', 'PAYMENT_OVERDUE'));
        expect(lapsed).toEqual({ outcome: 'ignored', reason: 'trial' });
        expect(yield* subscriptionRow(live)).toMatchObject({
          status: 'trialing',
          pendingPaymentId: 'pay_trial',
        });

        const ended = yield* seedFirm('trialacabado');
        yield* seedSubscription(ended, {
          gatewaySubscriptionId: 'sub_trial_fim',
          trialEndsAt: new Date(Date.now() - 86_400_000),
        });
        expect(yield* repo.applyEvent(event('sub_trial_fim', 'PAYMENT_OVERDUE'))).toMatchObject({
          outcome: 'applied',
          status: 'OVERDUE',
        });
      }),
  );

  it.effect('applyEvent: cancelada volta ativa e promovida ao pagar o checkout novo', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('volta');
      yield* seedSubscription(firm, {
        gatewaySubscriptionId: 'sub_volta',
        previousGatewaySubscriptionIds: ['sub_apagada'],
        status: 'CANCELED',
        planName: 'essencial',
        pendingPlanName: 'profissional',
        pendingCycle: 'monthly',
        pendingPaymentId: 'pay_volta',
      });

      const paid = yield* repo.applyEvent(
        event('sub_volta', 'PAYMENT_CONFIRMED', { id: 'pay_volta', dueDate: day('2026-11-05') }),
      );
      expect(paid).toEqual({ outcome: 'applied', status: 'ACTIVE', promoted: true });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        status: 'ACTIVE',
        planName: 'profissional',
        pendingPlanName: null,
        currentPeriodStart: day('2026-11-05'),
      });
    }),
  );

  it.effect(
    'applyEvent: troca paga por cobrança avulsa promove e reajusta a assinatura no gateway',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('upgrade');
        yield* seedSubscription(firm, {
          gatewaySubscriptionId: 'sub_up',
          status: 'ACTIVE',
          planName: 'essencial',
          currentPeriodStart: day('2026-10-01'),
          currentPeriodEnd: day('2026-11-01'),
          pendingPlanName: 'profissional',
          pendingCycle: 'monthly',
          pendingPaymentId: 'pay_up',
        });

        const calls: GatewayReprice[] = [];
        const paid = yield* repo.applyEvent(
          event(null, 'PAYMENT_CONFIRMED', { id: 'pay_up', dueDate: day('2026-10-20') }, firm),
          (change) => Effect.sync(() => void calls.push(change)),
        );

        expect(paid).toEqual({ outcome: 'applied', status: 'ACTIVE', promoted: true });
        expect(calls).toEqual([
          {
            subscriptionId: 'sub_up',
            planName: 'profissional',
            cycle: 'monthly',
            value: planPrice(PLANS.profissional, 'monthly'),
            nextDueDate: day('2026-11-20'),
          },
        ]);
        expect(yield* subscriptionRow(firm)).toMatchObject({
          planName: 'profissional',
          pendingPlanName: null,
          currentPeriodEnd: day('2026-11-20'),
        });
      }),
  );

  const scheduledFirm = (
    label: string,
    overrides: Partial<typeof subscription.$inferInsert> = {},
  ) =>
    Effect.gen(function* () {
      const firm = yield* seedFirm(label);
      yield* seedSubscription(firm, {
        gatewaySubscriptionId: `sub_${label}`,
        status: 'ACTIVE',
        planName: 'profissional',
        cycle: 'monthly',
        currentPeriodStart: day('2026-11-01'),
        currentPeriodEnd: day('2026-12-01'),
        scheduledPlanName: 'essencial',
        scheduledCycle: 'monthly',
        ...overrides,
      });
      return firm;
    });

  it.effect('scheduleDowngrade e unscheduleDowngrade: só mexem na agenda e na intenção', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('agenda');
      yield* seedSubscription(firm, {
        status: 'ACTIVE',
        planName: 'escritorio',
        cycle: 'yearly',
        currentPeriodStart: day('2026-11-01'),
        currentPeriodEnd: day('2027-11-01'),
        pendingPlanName: 'escritorio',
        pendingCycle: 'yearly',
        pendingPaymentId: 'pay_agenda',
      });

      yield* repo.scheduleDowngrade({ firmId: firm, planName: 'profissional', cycle: 'yearly' });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'escritorio',
        cycle: 'yearly',
        status: 'ACTIVE',
        currentPeriodEnd: day('2027-11-01'),
        scheduledPlanName: 'profissional',
        scheduledCycle: 'yearly',
        pendingPlanName: null,
        pendingPaymentId: null,
      });

      yield* repo.scheduleDowngrade({ firmId: firm, planName: 'essencial', cycle: 'monthly' });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        scheduledPlanName: 'essencial',
        scheduledCycle: 'monthly',
      });

      yield* repo.unscheduleDowngrade(firm);
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'escritorio',
        scheduledPlanName: null,
        scheduledCycle: null,
      });
    }),
  );

  it.effect('cancel e applyPlanNow limpam a troca agendada', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const canceled = yield* scheduledFirm('agenda-cancel');
      const applied = yield* scheduledFirm('agenda-agora');

      yield* repo.cancel(canceled);
      yield* repo.applyPlanNow({ firmId: applied, planName: 'essencial', cycle: 'monthly' });

      expect(yield* subscriptionRow(canceled)).toMatchObject({
        status: 'CANCELED',
        scheduledPlanName: null,
        scheduledCycle: null,
      });
      expect(yield* subscriptionRow(applied)).toMatchObject({
        planName: 'essencial',
        scheduledPlanName: null,
        scheduledCycle: null,
      });
    }),
  );

  it.effect('applyEvent: a fatura recorrente da renovação aplica a troca agendada', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('renova');
      const calls: GatewayReprice[] = [];

      const renewed = yield* repo.applyEvent(
        event('sub_renova', 'PAYMENT_CONFIRMED', { id: 'pay_renova', dueDate: day('2026-12-01') }),
        (change) => Effect.sync(() => void calls.push(change)),
      );

      expect(renewed).toEqual({ outcome: 'applied', status: 'ACTIVE', promoted: false });
      expect(calls).toEqual([]);
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'essencial',
        cycle: 'monthly',
        status: 'ACTIVE',
        currentPeriodStart: day('2026-12-01'),
        currentPeriodEnd: day('2027-01-01'),
        scheduledPlanName: null,
        scheduledCycle: null,
      });
    }),
  );

  it.effect('applyEvent: a renovação no ciclo agendado abre o período desse ciclo', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('renova-ciclo', {
        cycle: 'yearly',
        currentPeriodStart: day('2026-01-10'),
        currentPeriodEnd: day('2027-01-10'),
        scheduledPlanName: 'profissional',
        scheduledCycle: 'monthly',
      });

      yield* repo.applyEvent(
        event('sub_renova-ciclo', 'PAYMENT_RECEIVED', { dueDate: day('2027-01-10') }),
      );

      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'profissional',
        cycle: 'monthly',
        currentPeriodStart: day('2027-01-10'),
        currentPeriodEnd: day('2027-02-10'),
        scheduledPlanName: null,
      });
    }),
  );

  it.effect('applyEvent: o RECEIVED tardio da fatura que abriu o período não aplica nada', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('tardio');

      const late = yield* repo.applyEvent(
        event('sub_tardio', 'PAYMENT_RECEIVED', { id: 'pay_atual', dueDate: day('2026-11-01') }),
      );

      expect(late).toEqual({ outcome: 'applied', status: 'ACTIVE', promoted: false });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'profissional',
        currentPeriodStart: day('2026-11-01'),
        currentPeriodEnd: day('2026-12-01'),
        scheduledPlanName: 'essencial',
        scheduledCycle: 'monthly',
      });

      yield* repo.applyEvent(
        event('sub_tardio', 'PAYMENT_RECEIVED', { id: 'pay_velha', dueDate: day('2026-10-01') }),
      );
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'profissional',
        scheduledPlanName: 'essencial',
      });
    }),
  );

  it.effect(
    'applyEvent: reenvio do mesmo evento e CONFIRMED seguido de RECEIVED aplicam uma vez',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* scheduledFirm('reenvio');
        const confirmed = event('sub_reenvio', 'PAYMENT_CONFIRMED', { dueDate: day('2026-12-01') });

        expect(yield* repo.applyEvent(confirmed)).toMatchObject({ outcome: 'applied' });
        expect(yield* repo.applyEvent(confirmed)).toEqual({ outcome: 'duplicate' });
        const afterFirst = yield* subscriptionRow(firm);
        expect(afterFirst).toMatchObject({ planName: 'essencial', scheduledPlanName: null });

        yield* repo.applyEvent(
          event('sub_reenvio', 'PAYMENT_RECEIVED', { dueDate: day('2026-12-01') }),
        );
        expect(yield* subscriptionRow(firm)).toMatchObject({
          planName: 'essencial',
          currentPeriodStart: afterFirst.currentPeriodStart,
          currentPeriodEnd: afterFirst.currentPeriodEnd,
        });
      }),
  );

  it.effect('applyEvent: cobrança avulsa que avança o período não aplica a troca agendada', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('avulsa-agenda');

      yield* repo.applyEvent(
        event(null, 'PAYMENT_CONFIRMED', { id: 'pay_x', dueDate: day('2026-12-01') }, firm),
      );

      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'profissional',
        scheduledPlanName: 'essencial',
      });
    }),
  );

  it.effect(
    'applyEvent: firma OVERDUE que paga a fatura da renovação volta ACTIVE já no plano agendado',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* scheduledFirm('overdue-renova', { status: 'OVERDUE' });

        yield* repo.applyEvent(
          event('sub_overdue-renova', 'PAYMENT_RECEIVED', { dueDate: day('2026-12-01') }),
        );

        expect(yield* subscriptionRow(firm)).toMatchObject({
          status: 'ACTIVE',
          planName: 'essencial',
          currentPeriodEnd: day('2027-01-01'),
          scheduledPlanName: null,
        });
      }),
  );

  it.effect('applyEvent: OVERDUE que reativa sem avançar o período não aplica (e é ignorado)', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('overdue-velha', { status: 'OVERDUE' });

      const late = yield* repo.applyEvent(
        event('sub_overdue-velha', 'PAYMENT_RECEIVED', { dueDate: day('2026-10-01') }),
      );

      expect(late).toEqual({ outcome: 'ignored', reason: 'stale' });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        status: 'OVERDUE',
        planName: 'profissional',
        scheduledPlanName: 'essencial',
      });
    }),
  );

  it.effect('applyEvent: upgrade pago promove o plano e descarta a troca agendada', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('agenda-upgrade', {
        pendingPlanName: 'escritorio',
        pendingCycle: 'monthly',
        pendingPaymentId: 'pay_agenda_up',
      });

      yield* repo.applyEvent(
        event(null, 'PAYMENT_CONFIRMED', { id: 'pay_agenda_up', dueDate: day('2026-11-20') }, firm),
      );

      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'escritorio',
        scheduledPlanName: null,
        scheduledCycle: null,
      });
    }),
  );

  it.effect('applyEvent: assinatura encerrada no gateway descarta a troca agendada', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* scheduledFirm('agenda-encerrada');

      yield* repo.applyEvent(event('sub_agenda-encerrada', 'SUBSCRIPTION_DELETED'));

      expect(yield* subscriptionRow(firm)).toMatchObject({
        status: 'CANCELED',
        planName: 'profissional',
        scheduledPlanName: null,
        scheduledCycle: null,
      });
    }),
  );

  const upgradedFirm = (label: string) =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm(label);
      yield* seedSubscription(firm, {
        gatewaySubscriptionId: `sub_${label}`,
        status: 'ACTIVE',
        planName: 'essencial',
        cycle: 'monthly',
        currentPeriodStart: day('2027-01-01'),
        currentPeriodEnd: day('2027-02-01'),
        pendingPlanName: 'escritorio',
        pendingCycle: 'yearly',
        pendingPaymentId: `pay_${label}`,
      });
      yield* repo.applyEvent(
        event(null, 'PAYMENT_CONFIRMED', { id: `pay_${label}`, dueDate: day('2027-01-20') }, firm),
      );
      expect(yield* subscriptionRow(firm)).toMatchObject({ planName: 'escritorio' });
      return firm;
    });

  it.effect(
    'applyEvent: estorno da avulsa que promoveu volta ao plano e ao período anteriores e reajusta de volta',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* upgradedFirm('estorno');

        const calls: GatewayReprice[] = [];
        const refunded = yield* repo.applyEvent(
          event(null, 'PAYMENT_REFUNDED', { id: 'pay_estorno', dueDate: day('2027-01-20') }, firm),
          (change) => Effect.sync(() => void calls.push(change)),
        );

        expect(refunded).toEqual({ outcome: 'reverted' });
        expect(calls).toEqual([
          {
            subscriptionId: 'sub_estorno',
            planName: 'essencial',
            cycle: 'monthly',
            value: planPrice(PLANS.essencial, 'monthly'),
            nextDueDate: day('2027-02-01'),
          },
        ]);
        expect(yield* subscriptionRow(firm)).toMatchObject({
          status: 'ACTIVE',
          planName: 'essencial',
          cycle: 'monthly',
          currentPeriodStart: day('2027-01-01'),
          currentPeriodEnd: day('2027-02-01'),
        });

        const again = yield* repo.applyEvent(
          event(null, 'PAYMENT_CHARGEBACK_REQUESTED', { id: 'pay_estorno' }, firm),
        );
        expect(again).toEqual({ outcome: 'ignored', reason: 'charge' });
      }),
  );

  it.effect(
    'applyEvent: chargeback da avulsa com período anterior já vencido reajusta para hoje',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('chargeback');
        yield* seedSubscription(firm, {
          gatewaySubscriptionId: 'sub_cb',
          status: 'ACTIVE',
          planName: 'essencial',
          currentPeriodStart: day('2026-09-01'),
          currentPeriodEnd: day('2026-10-01'),
          pendingPlanName: 'profissional',
          pendingCycle: 'monthly',
          pendingPaymentId: 'pay_cb',
        });
        yield* repo.applyEvent(
          event(null, 'PAYMENT_CONFIRMED', { id: 'pay_cb', dueDate: day('2026-09-20') }, firm),
        );

        const calls: GatewayReprice[] = [];
        const charged = yield* repo.applyEvent(
          event(null, 'PAYMENT_CHARGEBACK_REQUESTED', { id: 'pay_cb' }, firm),
          (change) => Effect.sync(() => void calls.push(change)),
        );

        expect(charged).toEqual({ outcome: 'reverted' });
        expect(calls).toHaveLength(1);
        expect(calls[0]).toMatchObject({ planName: 'essencial', cycle: 'monthly' });
        expect(calls[0].nextDueDate.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
        expect(yield* subscriptionRow(firm)).toMatchObject({
          planName: 'essencial',
          currentPeriodEnd: day('2026-10-01'),
        });
      }),
  );

  it.effect('applyEvent: estorno da avulsa depois da fatura seguinte paga mantém o plano', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* upgradedFirm('estornotarde');

      yield* repo.applyEvent(
        event('sub_estornotarde', 'PAYMENT_CONFIRMED', { dueDate: day('2028-01-20') }),
      );

      const late = yield* repo.applyEvent(
        event(null, 'PAYMENT_REFUNDED', { id: 'pay_estornotarde' }, firm),
        () => Effect.die(new Error('não reajusta')),
      );
      expect(late).toEqual({ outcome: 'ignored', reason: 'charge' });
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'escritorio',
        currentPeriodEnd: day('2029-01-20'),
      });
    }),
  );

  it.effect('applyEvent: gateway falhou no reajuste → nada fica gravado e o reenvio aplica', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('reajustefalha');
      yield* seedSubscription(firm, {
        gatewaySubscriptionId: 'sub_rf',
        status: 'ACTIVE',
        planName: 'essencial',
        pendingPlanName: 'escritorio',
        pendingCycle: 'monthly',
        pendingPaymentId: 'pay_rf',
      });

      const incoming = event(null, 'PAYMENT_RECEIVED', { id: 'pay_rf' }, firm);
      const exit = yield* Effect.exit(
        repo.applyEvent(incoming, () => Effect.fail(new GatewayUnavailable())),
      );
      expect(exit._tag).toBe('Failure');
      expect(yield* subscriptionRow(firm)).toMatchObject({
        planName: 'essencial',
        pendingPaymentId: 'pay_rf',
      });

      expect(yield* repo.applyEvent(incoming, () => Effect.void)).toMatchObject({
        outcome: 'applied',
        promoted: true,
      });
    }),
  );

  it.effect(
    'applyEvent: cobrança avulsa vencida não bloqueia a firma em dia; só desfaz a troca',
    () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('upgradevencido');
        yield* seedSubscription(firm, {
          gatewaySubscriptionId: 'sub_uv',
          status: 'ACTIVE',
          planName: 'essencial',
          currentPeriodStart: day('2026-10-01'),
          pendingPlanName: 'profissional',
          pendingPaymentId: 'pay_uv',
          pendingInvoiceUrl: 'https://asaas/i/uv',
        });

        const lapsed = yield* repo.applyEvent(
          event(null, 'PAYMENT_OVERDUE', { id: 'pay_uv', dueDate: day('2026-10-20') }, firm),
        );
        expect(lapsed).toEqual({ outcome: 'ignored', reason: 'charge' });
        expect(yield* subscriptionRow(firm)).toMatchObject({
          status: 'ACTIVE',
          planName: 'essencial',
          pendingPlanName: null,
          pendingPaymentId: null,
          pendingInvoiceUrl: null,
        });
      }),
  );

  it.effect('applyEvent: evento informativo, assinatura desconhecida e externalReference', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const firm = yield* seedFirm('avulsa');
      yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_avulsa' });

      expect(yield* repo.applyEvent(event('sub_avulsa', 'PAYMENT_CREATED'))).toEqual({
        outcome: 'ignored',
        reason: 'event',
      });
      expect(yield* repo.applyEvent(event('sub_fantasma', 'PAYMENT_RECEIVED'))).toEqual({
        outcome: 'ignored',
        reason: 'unknown',
      });
      expect(yield* repo.applyEvent(event(null, 'PAYMENT_RECEIVED', {}, 'nao-e-uuid'))).toEqual({
        outcome: 'ignored',
        reason: 'unknown',
      });

      /* Cobrança avulsa (troca de plano) não tem `subscription`: o `externalReference` é o id
       * da firma. */
      const byFirm = yield* repo.applyEvent(event(null, 'PAYMENT_CONFIRMED', { value: 50 }, firm));
      expect(byFirm).toMatchObject({ outcome: 'applied', status: 'ACTIVE' });
      expect((yield* subscriptionRow(firm)).status).toBe('ACTIVE');
    }),
  );

  it.effect('expireLapsed: ACTIVE com período vencido além da carência vira OVERDUE', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const lapsed = yield* seedFirm('vencida');
      const inGrace = yield* seedFirm('nacarencia');
      const trial = yield* seedFirm('trial');
      const now = day('2026-11-20');
      yield* seedSubscription(lapsed, { status: 'ACTIVE', currentPeriodEnd: day('2026-11-01') });
      yield* seedSubscription(inGrace, { status: 'ACTIVE', currentPeriodEnd: day('2026-11-15') });
      yield* seedSubscription(trial, { status: 'trialing', trialEndsAt: day('2026-11-01') });

      const expired = yield* repo.expireLapsed(now, 7);
      expect(expired).toContain(lapsed);
      expect(expired).not.toContain(inGrace);
      expect(expired).not.toContain(trial);
      expect((yield* subscriptionRow(lapsed)).status).toBe('OVERDUE');
      expect((yield* subscriptionRow(inGrace)).status).toBe('ACTIVE');
      expect((yield* subscriptionRow(trial)).status).toBe('trialing');
    }),
  );

  it.effect('purgeWebhookEvents: apaga só os eventos anteriores à data', () =>
    Effect.gen(function* () {
      const repo = yield* SubscriptionsRepo;
      const old = `evt_old_${next()}`;
      const fresh = `evt_fresh_${next()}`;
      yield* repo.claimEvent(old, 'PAYMENT_RECEIVED');
      yield* repo.claimEvent(fresh, 'PAYMENT_RECEIVED');
      yield* Effect.promise(() =>
        db.execute(
          `update billing_webhook_event set created_at = now() - interval '40 days' where id = '${old}'`,
        ),
      );

      expect(yield* repo.purgeWebhookEvents(new Date(Date.now() - 30 * 86_400_000))).toBe(1);
      expect(yield* repo.claimEvent(old, 'PAYMENT_RECEIVED'), 'apagado: volta a ser inédito').toBe(
        true,
      );
      expect(yield* repo.claimEvent(fresh, 'PAYMENT_RECEIVED')).toBe(false);
    }),
  );
});

/* O que acontece quando o efeito falha DEPOIS da reivindicação: o Db abaixo deixa passar
 * as consultas até a N-ésima e mata essa. Reivindicação e efeito na mesma transação
 * significam que a reivindicação volta — e o reenvio do Asaas ativa a firma. */
const flakyDb = (failAt: number) =>
  Layer.effect(
    Db,
    Effect.gen(function* () {
      const real = yield* Db;
      let calls = 0;
      return Db.of({
        ...real,
        use: (f) => {
          calls += 1;
          return calls === failAt ? Effect.die(new Error('banco caiu no meio')) : real.use(f);
        },
      });
    }),
  ).pipe(Layer.provide(Db.layer));

layer(SubscriptionsRepo.layerNoDeps.pipe(Layer.provide(flakyDb(3))))(
  'SubscriptionsRepo.applyEvent com falha depois da reivindicação',
  (it) => {
    it.effect('a reivindicação é desfeita junto com o efeito; o reenvio processa', () =>
      Effect.gen(function* () {
        const repo = yield* SubscriptionsRepo;
        const firm = yield* seedFirm('falha');
        yield* seedSubscription(firm, { gatewaySubscriptionId: 'sub_falha' });
        const incoming = event('sub_falha', 'PAYMENT_RECEIVED', { dueDate: day('2026-11-01') });

        const exit = yield* Effect.exit(repo.applyEvent(incoming));
        expect(exit._tag).toBe('Failure');
        expect((yield* subscriptionRow(firm)).status).toBe('trialing');

        const retried = yield* repo.applyEvent(incoming);
        expect(retried).toMatchObject({ outcome: 'applied', status: 'ACTIVE' });
        expect((yield* subscriptionRow(firm)).status).toBe('ACTIVE');
      }),
    );
  },
);
