import {
  CreateInviteBody,
  IdParam,
  InviteTokenParam,
  UpdateFirmBody,
  planAllows,
} from '@competa/contracts';
import type { EventEmitter2 } from '../../lib/event-emitter.js';
import { addDays } from 'date-fns';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { withDb } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, params, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { EVENTS, type InviteCreatedEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import { AccountantRepository } from './accountant.repository.js';
import {
  CannotRemoveOwner,
  EmailAlreadyRegistered,
  InviteAlreadyPending,
  OnlyOwnerCanInvite,
  OnlyOwnerCanManageTeam,
  PlanCapabilityRequired,
} from './errors.js';
import { InviteRepository } from './invite.repository.js';
import type { FirmScope } from './scope.js';
import { UserDeviceRepository } from './user-device.repository.js';

const REMINDER_FIELDS = ['reminderMax', 'reminderDueSoonDays', 'reminderGapDays'] as const;

const isOwner = (scope: FirmScope, authUserId: string) =>
  withDb((db) => new AccountantRepository(db).isOwner(scope, authUserId));

const firmOf = (scope: FirmScope) => withDb((db) => new AccountantRepository(db).firm(scope));

/** Convidar é ato do dono: um Contador convidado não amplia o acesso ao tenant por conta
 *  própria. Sem isto, qualquer convidado convida — inclusive quem foi revogado em outro
 *  canal e ainda tem sessão. */
const createInvite = (events: EventEmitter2) =>
  route(
    'POST',
    '/invites',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope, accountantId, session } = yield* FirmContext;
        const input = yield* body(CreateInviteBody);

        if (!(yield* isOwner(scope, session.user.id))) {
          return yield* Effect.fail(new OnlyOwnerCanInvite());
        }

        const taken = yield* withDb((db) =>
          new AccountantRepository(db).userExistsByEmail(input.email),
        );
        if (taken) return yield* Effect.fail(new EmailAlreadyRegistered());

        const pending = yield* withDb((db) =>
          new InviteRepository(db).pendingForFirm(scope, input.email),
        );
        if (pending) return yield* Effect.fail(new InviteAlreadyPending());

        const { token, tokenHash } = createToken();
        const expiresAt = addDays(new Date(), env.INVITE_TTL_DAYS);
        const row = yield* withDb((db) =>
          new InviteRepository(db).createForFirm(scope, {
            email: input.email,
            tokenHash,
            expiresAt,
            createdBy: accountantId,
          }),
        );

        const url = `${env.WEB_URL}/convite/${token}`;

        // messaging entrega o convite (Fase 5). A URL continua na resposta porque o Contador
        // pode precisar passar o link por outro canal se o email não chegar.
        const created: InviteCreatedEvent = {
          email: row.email,
          firmName: yield* withDb((db) => new InviteRepository(db).firmName(scope)),
          inviteUrl: url,
          expiresAt,
        };

        events.emit(EVENTS.InviteCreated, created);

        return { id: row.id, email: row.email, url };
      }),
    ),
    { auth: firmRoute() },
  );

const previewInvite = route(
  'GET',
  '/invites/:token',
  handler(
    'GET',
    Effect.gen(function* () {
      const { token } = yield* params(InviteTokenParam);

      const row = yield* withDb((db) => new InviteRepository(db).findUsable(token));

      return {
        email: row.email,
        invitedBy: row.firmName ?? row.companyFirmName,
        companyName: row.companyName,
        target: row.accountingFirmId ? 'accounting_firm' : 'company',
      };
    }),
  ),
);

const listAccountants = route(
  'GET',
  '/accountants',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* withDb((db) => new AccountantRepository(db).list(scope));
    }),
  ),
  { auth: firmRoute() },
);

/** Remover = apagar o `user`: sessão e passkeys caem por cascade — revogação de acesso
 *  imediata, não só saída da lista. */
const removeAccountant = route(
  'DELETE',
  '/accountants/:id',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      if (!(yield* isOwner(scope, session.user.id))) {
        return yield* Effect.fail(new OnlyOwnerCanManageTeam());
      }

      const target = yield* withDb((db) => new AccountantRepository(db).findInFirm(scope, id));
      if (!target) return yield* Effect.fail(new NotFound('Contador não encontrado.'));
      // cobre também o dono tentando se remover: o dono é sempre owner
      if (target.owner) return yield* Effect.fail(new CannotRemoveOwner());

      yield* withDb((db) => new AccountantRepository(db).deleteAuthUser(target.authUserId));

      return { removed: true as const };
    }),
  ),
  { auth: firmRoute() },
);

const getFirm = route(
  'GET',
  '/accounting-firm',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      const row = yield* firmOf(scope);
      if (!row) return yield* Effect.fail(new NotFound('Contabilidade não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const deviceStats = route(
  'GET',
  '/accounting-firm/device-stats',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* withDb((db) => new UserDeviceRepository(db).platformStats(scope));
    }),
  ),
  { auth: firmRoute() },
);

/** `firmRoute({requires})` não serve aqui: o gate depende de QUAIS campos vieram no corpo —
 *  trancar a rota inteira travaria nome, logo e e-mail de contato junto. */
const updateFirm = route(
  'PATCH',
  '/accounting-firm',
  handler(
    'PATCH',
    Effect.gen(function* () {
      const { scope, planName, session } = yield* FirmContext;
      const input = yield* body(UpdateFirmBody);

      if (!(yield* isOwner(scope, session.user.id))) {
        return yield* Effect.fail(new OnlyOwnerCanManageTeam());
      }

      const tuningReminders = REMINDER_FIELDS.some((field) => input[field] !== undefined);
      if (tuningReminders && !planAllows(planName, 'reminderTuning')) {
        return yield* Effect.fail(new PlanCapabilityRequired('reminderTuning'));
      }

      yield* withDb((db) => new AccountantRepository(db).updateFirm(scope, input));

      return yield* firmOf(scope);
    }),
  ),
  { auth: firmRoute() },
);

const listPendingInvites = route(
  'GET',
  '/invites',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* withDb((db) => new InviteRepository(db).listPending(scope));
    }),
  ),
  { auth: firmRoute() },
);

const revokeInvite = route(
  'DELETE',
  '/invites/:id',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope, session } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      if (!(yield* isOwner(scope, session.user.id))) {
        return yield* Effect.fail(new OnlyOwnerCanManageTeam());
      }

      const revoked = yield* withDb((db) => new InviteRepository(db).revoke(scope, id));
      if (!revoked) return yield* Effect.fail(new NotFound('Convite não encontrado ou já usado.'));

      return { revoked: true as const };
    }),
  ),
  { auth: firmRoute() },
);

export const teamRoutes = (events: EventEmitter2) =>
  Layer.mergeAll(
    createInvite(events),
    previewInvite,
    listAccountants,
    removeAccountant,
    getFirm,
    deviceStats,
    updateFirm,
    listPendingInvites,
    revokeInvite,
  );
