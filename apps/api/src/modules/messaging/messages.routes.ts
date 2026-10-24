import { IdParam, MessageListQuery, PeriodIdQuery } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import { fromRuntime } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler, paginated } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { params, query, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import type { FirmScope } from '../auth/scope.js';
import { MessagesRepo } from './message.repo.js';

/** A varredura de lembretes continua sendo a instância do container Nest (o cron é a F5). */
export type RunReminders = (scope: FirmScope) => Promise<unknown>;

const list = route(
  'GET',
  '/messages',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const filters = yield* query(MessageListQuery);

      const { rows, total } = yield* fromRuntime(
        MessagesRepo.use((repo) => repo.list(scope, filters)),
      );

      return paginated(rows, { page: filters.page, perPage: filters.perPage, total });
    }),
  ),
  { auth: firmRoute() },
);

/* `periodId` obrigatório e validado: ausente devolvia `[]` silencioso, e um valor que
 * não fosse UUID virava 500 do Postgres em vez de 400. */
const failures = route(
  'GET',
  '/messages/failures',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { periodId } = yield* query(PeriodIdQuery);

      return yield* fromRuntime(MessagesRepo.use((repo) => repo.failuresByPeriod(scope, periodId)));
    }),
  ),
  { auth: firmRoute() },
);

const resend = route(
  'POST',
  '/messages/:id/resend',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      /* Bug congelado #14: `resend()` chama `deliver()` sem `channel`, então o reenvio de
       * uma mensagem de whatsapp sai pelo provider default — email. */
      const result = yield* fromRuntime(MessagesRepo.use((repo) => repo.resend(scope, id)));
      if (!result) return yield* Effect.fail(new NotFound('Mensagem não encontrada.'));

      return result;
    }),
  ),
  { auth: firmRoute() },
);

/** Dispara a varredura de lembretes sob demanda, restrita à Contabilidade do chamador
 *  (AUTHZ-2). A varredura global continua sendo só do cron. */
const runReminders = (run: RunReminders) =>
  route(
    'POST',
    '/messages/reminders/run',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope } = yield* FirmContext;

        return yield* Effect.promise(() => run(scope));
      }),
    ),
    { auth: firmRoute() },
  );

export const messagesRoutes = (run: RunReminders) =>
  Layer.mergeAll(list, failures, resend, runReminders(run));
