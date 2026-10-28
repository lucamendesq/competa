import { layer } from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { eq } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import { Db } from '../../src/infra/database/effect.js';
import { accountingFirm, subscription } from '../../src/infra/database/schema/index.js';
import {
  SubscriptionsRepo,
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
