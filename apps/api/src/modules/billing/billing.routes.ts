import { CheckoutBody, PLANS, planPrice } from '@competa/contracts';
import { Logger } from '../../lib/logger.js';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, route } from '../../http/platform.js';
import { AccountantsRepo } from '../auth/accountant.repo.js';
import { OnlyOwnerCanManageTeam } from '../auth/errors.js';
import { AsaasBilling } from './providers/asaas-billing.provider.js';
import { LogBilling } from './providers/log-billing.provider.js';
import { squashError } from '../../infra/database/error.js';
import { SubscriptionsRepo } from './subscription.repo.js';

/* Mesma escolha do `BillingModule`. Ambos os providers são sem estado (só `fetch` e log),
 * então a instância do shell Effect conviver com a do Nest não abre recurso nenhum. */
const billing = env.NODE_ENV === 'production' ? new AsaasBilling() : new LogBilling();

const logger = new Logger('BillingController');

const checkout = route(
  'POST',
  '/billing/checkout',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;
      const input = yield* body(CheckoutBody);

      const owner = yield* AccountantsRepo.use((repo) => repo.isOwner(scope, session.user.id));
      if (!owner) return yield* Effect.fail(new OnlyOwnerCanManageTeam());

      const firm = yield* AccountantsRepo.use((repo) => repo.firm(scope));
      if (!firm) return yield* Effect.die(new Error('Contabilidade não encontrada'));

      /* 1. Cliente no gateway, identificado pelo ID DA FIRMA. O e-mail é só dado de contato:
       * usá-lo como chave fazia toda firma sem e-mail cair no mesmo endereço de fallback e
       * colidir num cliente só. */
      const { customerId } = yield* Effect.promise(() =>
        billing.getOrCreateCustomer({
          name: firm.name,
          email: firm.contactEmail || 'faturamento@competa.com.br',
          externalReference: firm.id,
        }),
      );

      // 2. Define o plano e cria a assinatura, respeitando a Oferta Fundador se houver
      const { planName, cycle } = input;
      const current = yield* SubscriptionsRepo.use((repo) => repo.findByFirm(firm.id));
      const { subscriptionId, checkoutUrl } = yield* Effect.promise(() =>
        billing.createSubscription({
          customerId,
          planName,
          cycle,
          value: planPrice(PLANS[planName], cycle, current?.priceOverride?.[planName]),
          externalReference: firm.id,
        }),
      );

      /* 3. A assinatura ANTERIOR morre aqui. Sem isto ela seguia cobrando para sempre: o
       * checkout só sobrescrevia o id no banco, e os webhooks dela deixavam de casar com
       * qualquer linha — o cliente pagava os dois planos e ninguém via. Falha no
       * cancelamento não derruba o checkout: a nova assinatura já existe, e cobrança dupla
       * resolvida depois é melhor que firma sem plano nenhum. */
      const previous = current?.gatewaySubscriptionId;
      if (previous && previous !== subscriptionId) {
        yield* Effect.promise(() => billing.cancelSubscription(previous)).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              logger.error(
                `Assinatura anterior ${previous} da firma ${firm.id} não foi cancelada no gateway`,
                squashError(cause),
              );
            }),
          ),
        );
      }

      // 4. Grava a INTENÇÃO e os ids do gateway; quem promove o plano é o webhook.
      yield* SubscriptionsRepo.use((repo) =>
        repo.startCheckout({
          firmId: firm.id,
          planName,
          cycle,
          gatewayCustomerId: customerId,
          gatewaySubscriptionId: subscriptionId,
        }),
      );

      return { checkoutUrl, simulated: billing.simulated };
    }),
  ),
  { auth: firmRoute() },
);

export const billingRoutes = Layer.mergeAll(checkout);
