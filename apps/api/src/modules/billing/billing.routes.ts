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
import { NotFound } from '../../lib/app-error.js';
import { AsaasBilling } from './providers/asaas-billing.provider.js';
import { LogBilling } from './providers/log-billing.provider.js';
import { squashError } from '../../infra/database/error.js';
import { SubscriptionsRepo } from './subscription.repo.js';

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

      // 2. Define o plano, respeitando a Oferta Fundador se houver
      const { planName, cycle } = input;
      const current = yield* SubscriptionsRepo.use((repo) => repo.findByFirm(firm.id));
      const value = planPrice(PLANS[planName], cycle, current?.priceOverride?.[planName]);
      const previous = current?.gatewaySubscriptionId;

      /* 3. Já existe assinatura no gateway → TROCA no lugar. Criar outra deixava duas vivas
       * (o checkout só sobrescrevia o id no banco, e os webhooks da antiga paravam de casar
       * com qualquer linha — o cliente pagava os dois planos e ninguém via). A troca também
       * conserta a cobrança em aberto, então o boleto que ele já tem passa a valer o preço
       * novo em vez de virar receita perdida.
       *
       * Se a troca falhar, cai para o caminho antigo: inativa a anterior e cria uma nova.
       * Mais caro, mas o Contador não fica sem conseguir assinar. */
      const changed = previous
        ? yield* Effect.promise(() =>
            billing.changeSubscriptionPlan(previous, { planName, cycle, value }),
          ).pipe(
            Effect.as(true),
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                logger.error(
                  `Troca de plano em ${previous} falhou; recriando a assinatura da firma ${firm.id}`,
                  squashError(cause),
                );
                return false;
              }),
            ),
          )
        : false;

      let subscriptionId = previous!;
      let checkoutUrl = '';

      if (changed) {
        /* A fatura é a MESMA de antes, com o valor corrigido — não nasce cobrança nova. */
        checkoutUrl = (yield* Effect.promise(() => billing.pendingInvoiceUrl(previous!))) ?? '';
      } else {
        const created = yield* Effect.promise(() =>
          billing.createSubscription({
            customerId,
            planName,
            cycle,
            value,
            externalReference: firm.id,
          }),
        );
        subscriptionId = created.subscriptionId;
        checkoutUrl = created.checkoutUrl;

        if (previous && previous !== subscriptionId) {
          yield* Effect.promise(() => billing.deactivateSubscription(previous)).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                logger.error(
                  `Assinatura anterior ${previous} da firma ${firm.id} segue ativa no gateway`,
                  squashError(cause),
                );
              }),
            ),
          );
        }
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

/** O que a Contabilidade vê sobre a própria assinatura, e por onde ela PAGA. O
 *  `invoiceUrl` é a página do Asaas: é lá que se escolhe boleto, Pix ou cartão, e é lá que
 *  se troca o cartão. Fazer isso por rota nossa exigiria receber número e CVV, o que nos
 *  colocaria dentro do escopo do PCI-DSS — a própria doc do Asaas classifica "dados passam
 *  pelo seu backend" como escopo mantido. */
const subscriptionStatus = route(
  'GET',
  '/billing/subscription',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      const firm = yield* AccountantsRepo.use((repo) => repo.firm(scope));
      if (!firm) return yield* Effect.die(new Error('Contabilidade não encontrada'));

      const current = yield* SubscriptionsRepo.use((repo) => repo.findByFirm(firm.id));
      if (!current) return yield* Effect.fail(new NotFound('Assinatura não encontrada.'));

      /* Só consulta o gateway quando há assinatura lá: o FAQ deles pede para não usar GET
       * como polling, e firma em trial não tem o que consultar. */
      const invoiceUrl = current.gatewaySubscriptionId
        ? yield* Effect.promise(() =>
            billing.pendingInvoiceUrl(current.gatewaySubscriptionId!),
          ).pipe(
            Effect.catchCause((cause) =>
              Effect.sync(() => {
                logger.error(
                  `Fatura em aberto da firma ${firm.id} não pôde ser consultada`,
                  squashError(cause),
                );
                return null;
              }),
            ),
          )
        : null;

      return {
        planName: current.planName,
        cycle: current.cycle,
        status: current.status,
        trialEndsAt: current.trialEndsAt,
        currentPeriodEnd: current.currentPeriodEnd,
        /* Plano escolhido num checkout que ainda não foi pago. A tela precisa distinguir
         * "contratou" de "está valendo". */
        pendingPlanName: current.pendingPlanName,
        pendingCycle: current.pendingCycle,
        invoiceUrl,
      };
    }),
  ),
  { auth: firmRoute() },
);

export const billingRoutes = Layer.mergeAll(checkout, subscriptionStatus);
