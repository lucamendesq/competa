import { Logger } from '../../lib/logger.js';
import { PLANS, RegisterDeviceBody, SignUpBody, type PlanName } from '@competa/contracts';
import { APIError } from 'better-auth/api';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { squashError } from '../../infra/database/error.js';
import { handler } from '../../http/envelope.js';
import { FirmContext, SessionContext } from '../../http/context.js';
import { firmRoute, sessionRoute } from '../../http/middleware/auth.js';
import { body, publicRoute, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { isFailure } from '../../lib/either.js';
import { AccountantsRepo } from './accountant.repo.js';
import { EmailAlreadyRegistered, InviteEmailMismatch, InviteTargetUnsupported } from './errors.js';
import { InvitesRepo } from './invite.repo.js';
import { UserDevicesRepo } from './user-device.repo.js';

const logger = new Logger('AuthController');
const auth = new BetterAuthAdapter();

/** Aceite de convite de Contador. Público: quem chama ainda não tem conta. */
const signUp = route(
  'POST',
  '/auth/sign-up',
  handler(
    'POST',
    Effect.gen(function* () {
      const input = yield* body(SignUpBody);

      const found = yield* InvitesRepo.use((repo) => repo.findUsable(input.token));

      if (found.email.toLowerCase() !== input.email.toLowerCase()) {
        return yield* Effect.fail(new InviteEmailMismatch());
      }

      const { accountingFirmId } = found;
      if (!accountingFirmId) return yield* Effect.fail(new InviteTargetUnsupported());

      const created = yield* Effect.promise(() =>
        auth.signUpEmail({ name: input.name, email: input.email, password: input.password }),
      );

      if (isFailure(created)) {
        logger.error('Falha ao criar conta no Better Auth', created.error);

        const isDuplicateEmail =
          created.error instanceof APIError &&
          created.error.body?.code === 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL';

        if (!isDuplicateEmail) return yield* Effect.die(created.error);

        return yield* Effect.fail(new EmailAlreadyRegistered());
      }

      /* Bug congelado #22: com `asResponse: true` o better-auth devolve a duplicidade como
       * Response, o adapter embrulha como sucesso com `userId: ''` e o insert estoura no
       * Postgres — 500, e não o 409 que o branch acima pretendia. O rollback da transação
       * preserva o convite. */
      const { userId } = created.value;

      yield* AccountantsRepo.use((accountants) =>
        accountants.acceptInvite({ authUserId: userId, accountingFirmId, inviteId: found.id }).pipe(
          Effect.onError((cause) =>
            accountants.deleteAuthUser(userId).pipe(
              Effect.catchCause((compensation) =>
                Effect.sync(() => {
                  logger.error(
                    `Falha ao compensar (apagar user ${userId}) após erro no signup`,
                    squashError(compensation),
                  );
                }),
              ),
              Effect.andThen(
                Effect.sync(() => {
                  logger.error('Falha ao vincular convite ao accountant', squashError(cause));
                }),
              ),
            ),
          ),
        ),
      );

      return { userId };
    }),
  ),
  { auth: publicRoute },
);

const me = route(
  'GET',
  '/auth/me',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;

      const row = yield* AccountantsRepo.use((repo) => repo.findMe(scope, session.user.id));
      if (!row) return yield* Effect.fail(new NotFound());

      const plan = PLANS[(row.subscriptionPlanName ?? 'trial') as PlanName] ?? PLANS.trial;

      return {
        accountant: { id: row.accountantId, name: row.name, email: row.email, owner: row.owner },
        accountingFirm: {
          id: row.firmId,
          name: row.firmName,
          logoUrl: row.firmLogoUrl,
          contactEmail: row.firmContactEmail,
          cnpj: row.firmCnpj,
          /** A web decide o que renderizar com isto — sem ele o usuário só descobre o gate
           *  tomando 402 depois de clicar. */
          plan: {
            name: plan.name,
            companyCap: plan.companyCap,
            capabilities: plan.capabilities,
          },
          subscription: row.subscriptionStatus
            ? {
                status: row.subscriptionStatus,
                planName: row.subscriptionPlanName,
                cycle: row.subscriptionCycle,
                trialEndsAt: row.subscriptionTrialEndsAt,
                /** Cancelada escreve até aqui; a web decide o aviso de bloqueio com isto. */
                currentPeriodEnd: row.subscriptionCurrentPeriodEnd,
                /** Oferta Fundador: a tela de plano tem que mostrar o preço que ele paga. */
                priceOverride: row.subscriptionPriceOverride,
              }
            : undefined,
        },
      };
    }),
  ),
  { auth: firmRoute() },
);

const device = route(
  'PATCH',
  '/auth/device',
  handler(
    'PATCH',
    Effect.gen(function* () {
      const session = yield* SessionContext;
      const input = yield* body(RegisterDeviceBody);
      const request = yield* HttpServerRequest.HttpServerRequest;

      yield* UserDevicesRepo.use((repo) =>
        repo.upsert({
          userId: session.user.id,
          deviceId: input.deviceId,
          platform: input.platform,
          installed: input.installed,
          userAgent: request.headers['user-agent'],
        }),
      );
    }),
    204,
  ),
  { auth: sessionRoute },
);

export const authRoutes = Layer.mergeAll(signUp, me, device);
