import { PLANS, RegisterDeviceBody, type PlanName } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import { HttpServerRequest } from 'effect/http';
import { withDb } from '../../effect/runtime.js';
import { handler } from '../../http/envelope.js';
import { FirmContext, SessionContext } from '../../http/context.js';
import { firmRoute, sessionRoute } from '../../http/middleware/auth.js';
import { body, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { AccountantRepository } from './accountant.repository.js';
import { UserDeviceRepository } from './user-device.repository.js';

const me = route(
  'GET',
  '/auth/me',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;

      const row = yield* withDb((db) =>
        new AccountantRepository(db).findMe(scope, session.user.id),
      );
      if (!row) return yield* Effect.fail(new NotFound());

      const plan = PLANS[(row.subscriptionPlanName ?? 'trial') as PlanName] ?? PLANS.trial;

      return {
        accountant: { id: row.accountantId, name: row.name, email: row.email, owner: row.owner },
        accountingFirm: {
          id: row.firmId,
          name: row.firmName,
          logoUrl: row.firmLogoUrl,
          contactEmail: row.firmContactEmail,
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

      yield* withDb((db) =>
        new UserDeviceRepository(db).upsert({
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

export const authRoutes = Layer.mergeAll(me, device);
