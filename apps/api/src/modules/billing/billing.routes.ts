import {
  CheckoutBody,
  PLANS,
  planPrice,
  type BillingCycle,
  type PlanName,
} from '@competa/contracts';
import { Logger } from '../../lib/logger.js';
import { Effect, Layer } from 'effect';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, route } from '../../http/platform.js';
import { AccountantsRepo } from '../auth/accountant.repo.js';
import { OnlyOwnerCanManageTeam } from '../auth/errors.js';
import { NotFound, ValidationError } from '../../lib/app-error.js';
import { squashError } from '../../infra/database/error.js';
import { upgradeChargeNow } from './billing-rules.js';
import { billing, gateway } from './gateway.js';
import { withFirmFlight } from './checkout-flight.js';
import { SubscriptionsRepo } from './subscription.repo.js';

const logger = new Logger('BillingController');

/** Preço que a firma paga pelo plano vigente. Trial não custa nada. */
const currentPrice = (current: {
  planName: string;
  cycle: string;
  priceOverride: Partial<Record<string, number>> | null;
}) =>
  current.planName in PLANS && current.planName !== 'trial'
    ? planPrice(
        PLANS[current.planName as PlanName],
        current.cycle as BillingCycle,
        current.priceOverride?.[current.planName],
      )
    : 0;

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

      /* O gateway não emite cobrança sem o documento do pagador. A firma que ainda não tem
       * CNPJ manda no corpo do checkout, e ele fica gravado para as próximas. */
      const cnpj = firm.cnpj ?? input.cnpj;
      if (!cnpj) {
        const message = 'Informe o CNPJ da Contabilidade para emitir a cobrança.';
        return yield* Effect.fail(new ValidationError(message, [{ path: ['cnpj'], message }]));
      }
      if (!firm.cnpj) yield* AccountantsRepo.use((repo) => repo.updateFirm(scope, { cnpj }));

      return yield* withFirmFlight(
        firm.id,
        Effect.gen(function* () {
          /* 1. Cliente no gateway, identificado pelo ID DA FIRMA. O e-mail é só dado de
           * contato: usá-lo como chave fazia toda firma sem e-mail cair no mesmo endereço de
           * fallback e colidir num cliente só. */
          const { customerId } = yield* gateway(() =>
            billing.getOrCreateCustomer({
              name: firm.name,
              email: firm.contactEmail || 'faturamento@competa.com.br',
              cpfCnpj: cnpj,
              externalReference: firm.id,
            }),
          );

          // 2. Define o plano, respeitando a Oferta Fundador se houver
          const { planName, cycle } = input;
          const current = yield* SubscriptionsRepo.use((repo) => repo.findByFirm(firm.id));
          const value = planPrice(PLANS[planName], cycle, current?.priceOverride?.[planName]);
          const previous = current?.gatewaySubscriptionId;

          const persist = (input: {
            gatewaySubscriptionId: string;
            paymentId: string | null;
            invoiceUrl: string | null;
          }) =>
            SubscriptionsRepo.use((repo) =>
              repo.startCheckout({
                firmId: firm.id,
                planName,
                cycle,
                gatewayCustomerId: customerId,
                gatewaySubscriptionId: input.gatewaySubscriptionId,
                pendingPaymentId: input.paymentId,
                pendingInvoiceUrl: input.invoiceUrl,
              }),
            );

          /* Fatura em aberto da assinatura, se houver. Consultada DEPOIS da troca no gateway:
           * uma falha aqui não pode desfazer o que o Asaas já mudou, então a intenção é
           * gravada mesmo sem o link. */
          const openInvoice = (subscriptionId: string) =>
            gateway(() => billing.pendingInvoice(subscriptionId)).pipe(
              Effect.catchCause((cause) =>
                Effect.sync(() => {
                  logger.error(
                    `Fatura em aberto de ${subscriptionId} (firma ${firm.id}) não pôde ser consultada`,
                    squashError(cause),
                  );
                  return null;
                }),
              ),
            );

          /* 3a. Assinatura EM DIA: a troca tem efeito agora. Preço igual ou menor vale na
           * hora e a próxima fatura já sai no valor novo. Upgrade cobra hoje o novo ciclo
           * descontado do que sobrou do atual — sem isto a troca só valia na próxima fatura,
           * até 12 meses no anual. Se o gateway já emitiu a próxima fatura, ela é corrigida
           * em vez de nascer uma cobrança a mais. */
          if (previous && current?.status === 'ACTIVE') {
            const pending = yield* openInvoice(previous);
            const paidNow = currentPrice(current);
            const chargeNow =
              pending ||
              value <= paidNow ||
              !current.currentPeriodStart ||
              !current.currentPeriodEnd
                ? null
                : upgradeChargeNow({
                    currentPrice: paidNow,
                    newPrice: value,
                    periodStart: current.currentPeriodStart,
                    periodEnd: current.currentPeriodEnd,
                    now: new Date(),
                  });

            if (pending) {
              yield* gateway(() =>
                billing.changeSubscriptionPlan(previous, { planName, cycle, value }),
              );
              yield* persist({
                gatewaySubscriptionId: previous,
                paymentId: pending.id,
                invoiceUrl: pending.invoiceUrl,
              });
              return {
                checkoutUrl: pending.invoiceUrl,
                simulated: billing.simulated,
                applied: false,
              };
            }

            if (chargeNow === null) {
              yield* gateway(() =>
                billing.changeSubscriptionPlan(previous, { planName, cycle, value }),
              );
              yield* SubscriptionsRepo.use((repo) =>
                repo.applyPlanNow({ firmId: firm.id, planName, cycle }),
              );
              return { checkoutUrl: null, simulated: billing.simulated, applied: true };
            }

            /* Só a cobrança: a assinatura é reajustada pelo webhook quando ela for paga.
             * Reajustar aqui cobrava o plano novo de quem não pagou a diferença, e a intenção
             * gravada logo depois da cobrança garante que pagá-la promove o plano. */
            const charge = yield* gateway(() =>
              billing.createCharge({
                customerId,
                value: chargeNow,
                description: `Troca para o plano ${PLANS[planName].label} (${cycle === 'yearly' ? 'anual' : 'mensal'}) - Competa`,
                externalReference: firm.id,
              }),
            );
            yield* persist({
              gatewaySubscriptionId: previous,
              paymentId: charge.paymentId,
              invoiceUrl: charge.invoiceUrl || null,
            });
            return { checkoutUrl: charge.invoiceUrl, simulated: billing.simulated, applied: false };
          }

          /* 3b. Já existe assinatura no gateway (trial com fatura em aberto, ou inadimplente):
           * TROCA no lugar. Criar outra deixava duas vivas (o checkout só sobrescrevia o id
           * no banco, e os webhooks da antiga paravam de casar com qualquer linha — o cliente
           * pagava os dois planos e ninguém via). A troca também conserta a cobrança em
           * aberto, então o boleto que ele já tem passa a valer o preço novo.
           *
           * Se a troca falhar, cai para o caminho antigo: inativa a anterior e cria uma nova.
           * Mais caro, mas o Contador não fica sem conseguir assinar.
           *
           * Cancelada não troca nem inativa: o cancelamento já apagou a assinatura no
           * gateway, então a volta é sempre por uma assinatura nova. */
          const canceled = current?.status === 'CANCELED';
          const changed =
            previous && !canceled
              ? yield* gateway(() =>
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

          if (changed) {
            const invoice = yield* openInvoice(previous!);
            yield* persist({
              gatewaySubscriptionId: previous!,
              paymentId: invoice?.id ?? null,
              invoiceUrl: invoice?.invoiceUrl ?? null,
            });

            /* Sem fatura em aberto não há o que pagar por este caminho: a troca vale na
             * próxima fatura. A web explica em vez de fingir redirecionamento. */
            return {
              checkoutUrl: invoice?.invoiceUrl ?? null,
              simulated: billing.simulated,
              applied: false,
            };
          }

          const created = yield* gateway(() =>
            billing.createSubscription({
              customerId,
              planName,
              cycle,
              value,
              externalReference: firm.id,
            }),
          );

          /* Grava a nova ANTES de inativar a anterior: o `SUBSCRIPTION_INACTIVATED` que a
           * inativação dispara só é ignorado quando a anterior já saiu de
           * `gatewaySubscriptionId`. */
          yield* persist({
            gatewaySubscriptionId: created.subscriptionId,
            paymentId: created.paymentId,
            invoiceUrl: created.checkoutUrl || null,
          });

          if (previous && !canceled && previous !== created.subscriptionId) {
            yield* gateway(() => billing.deactivateSubscription(previous)).pipe(
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

          return { checkoutUrl: created.checkoutUrl, simulated: billing.simulated, applied: false };
        }),
      );
    }),
  ),
  { auth: firmRoute({ billing: true }) },
);

/* Link da fatura vencida de uma assinatura cujo link não ficou gravado (fatura recorrente):
 * consultado no gateway, por firma, uma vez a cada 5 minutos. O FAQ do Asaas pede para não
 * usar GET como polling. ponytail: em memória, por processo. */
const INVOICE_URL_TTL_MS = 5 * 60_000;
const invoiceUrlCache = new Map<string, { url: string | null; expiresAt: number }>();

const overdueInvoiceUrl = (firmId: string, gatewaySubscriptionId: string) =>
  Effect.gen(function* () {
    const cached = invoiceUrlCache.get(firmId);
    if (cached && cached.expiresAt > Date.now()) return cached.url;

    const url = yield* gateway(() => billing.pendingInvoice(gatewaySubscriptionId)).pipe(
      Effect.map((invoice) => invoice?.invoiceUrl ?? null),
      Effect.catchCause((cause) =>
        Effect.sync(() => {
          logger.error(
            `Fatura em aberto da firma ${firmId} não pôde ser consultada`,
            squashError(cause),
          );
          return null;
        }),
      ),
    );

    invoiceUrlCache.set(firmId, { url, expiresAt: Date.now() + INVOICE_URL_TTL_MS });
    return url;
  });

/** O que a Contabilidade vê sobre a própria assinatura, e por onde ela PAGA. O
 *  `invoiceUrl` é a página do Asaas: é lá que se escolhe boleto, Pix ou cartão, e é lá que
 *  se troca o cartão. Fazer isso por rota nossa exigiria receber número e CVV, o que nos
 *  colocaria dentro do escopo do PCI-DSS — a própria doc do Asaas classifica "dados passam
 *  pelo seu backend" como escopo mantido.
 *
 *  Só o dono recebe o link: é ele quem assina, e a página da fatura é do pagador. */
const subscriptionStatus = route(
  'GET',
  '/billing/subscription',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;

      const firm = yield* AccountantsRepo.use((repo) => repo.firm(scope));
      if (!firm) return yield* Effect.die(new Error('Contabilidade não encontrada'));

      const current = yield* SubscriptionsRepo.use((repo) => repo.findByFirm(firm.id));
      if (!current) return yield* Effect.fail(new NotFound('Assinatura não encontrada.'));

      const owner = yield* AccountantsRepo.use((repo) => repo.isOwner(scope, session.user.id));

      const invoiceUrl = !owner
        ? null
        : (current.pendingInvoiceUrl ??
          (current.status === 'OVERDUE' && current.gatewaySubscriptionId
            ? yield* overdueInvoiceUrl(firm.id, current.gatewaySubscriptionId)
            : null));

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
  { auth: firmRoute({ billing: true }) },
);

/** Encerramento deliberado pelo dono. O acesso segue até o fim do período já pago (o guard
 *  lê `currentPeriodEnd`); no gateway a assinatura é apagada, junto das cobranças em
 *  aberto — ninguém paga pelo que cancelou. */
const cancel = route(
  'DELETE',
  '/billing/subscription',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;

      const owner = yield* AccountantsRepo.use((repo) => repo.isOwner(scope, session.user.id));
      if (!owner) return yield* Effect.fail(new OnlyOwnerCanManageTeam());

      const current = yield* SubscriptionsRepo.use((repo) => repo.findByFirm(scope));
      if (!current) return yield* Effect.fail(new NotFound('Assinatura não encontrada.'));

      if (current.status !== 'CANCELED') {
        if (current.gatewaySubscriptionId) {
          yield* gateway(() => billing.cancelSubscription(current.gatewaySubscriptionId!));
        }
        yield* SubscriptionsRepo.use((repo) => repo.cancel(scope));
      }

      return { status: 'CANCELED', currentPeriodEnd: current.currentPeriodEnd };
    }),
  ),
  { auth: firmRoute({ billing: true }) },
);

export const billingRoutes = Layer.mergeAll(checkout, subscriptionStatus, cancel);
