import { CheckoutBody, PLANS, planPrice } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { fromRuntime } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, route } from '../../http/platform.js';
import { AccountantsRepo } from '../auth/accountant.repo.js';
import { OnlyOwnerCanManageTeam } from '../auth/errors.js';
import { AsaasBilling } from './providers/asaas-billing.provider.js';
import { LogBilling } from './providers/log-billing.provider.js';
import { SubscriptionsRepo } from './subscription.repo.js';

/* Mesma escolha do `BillingModule`. Ambos os providers são sem estado (só `fetch` e log),
 * então a instância do shell Effect conviver com a do Nest não abre recurso nenhum. */
const billing = env.NODE_ENV === 'production' ? new AsaasBilling() : new LogBilling();

const checkout = route(
  'POST',
  '/billing/checkout',
  handler(
    'POST',
    Effect.gen(function* () {
      /* Bug congelado #19: o checkout é escrita, então `firmRoute()` já devolveu 402 para
       * firma OVERDUE/CANCELED/trial-expirado — justamente na rota que regularizaria. */
      const { scope, session } = yield* FirmContext;
      const input = yield* body(CheckoutBody);

      const owner = yield* fromRuntime(
        AccountantsRepo.use((repo) => repo.isOwner(scope, session.user.id)),
      );
      if (!owner) return yield* Effect.fail(new OnlyOwnerCanManageTeam());

      const firm = yield* fromRuntime(AccountantsRepo.use((repo) => repo.firm(scope)));
      if (!firm) return yield* Effect.die(new Error('Contabilidade não encontrada'));

      // 1. Obtém ou cria o cliente no Asaas
      const { customerId } = yield* Effect.promise(() =>
        billing.getOrCreateCustomer({
          name: firm.name,
          email: firm.contactEmail || 'faturamento@competa.com.br',
        }),
      );

      // 2. Define o plano e cria a assinatura, respeitando a Oferta Fundador se houver
      const { planName, cycle } = input;
      const current = yield* fromRuntime(SubscriptionsRepo.use((repo) => repo.findByFirm(firm.id)));
      const { subscriptionId, checkoutUrl } = yield* Effect.promise(() =>
        billing.createSubscription({
          customerId,
          planName,
          cycle,
          value: planPrice(PLANS[planName], cycle, current?.priceOverride?.[planName]),
        }),
      );

      /* 3. Salva no banco o plano, o ciclo e os IDs do gateway. Bug congelado #20: é UPDATE
       * sem upsert (firma sem linha de subscription não grava nada) e nunca toca `status`. */
      yield* fromRuntime(
        SubscriptionsRepo.use((repo) =>
          repo.startCheckout({
            firmId: firm.id,
            planName,
            cycle,
            gatewayCustomerId: customerId,
            gatewaySubscriptionId: subscriptionId,
          }),
        ),
      );

      return { checkoutUrl, simulated: billing.simulated };
    }),
  ),
  { auth: firmRoute() },
);

export const billingRoutes = Layer.mergeAll(checkout);
