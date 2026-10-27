import { IdParam, MessageListQuery, PeriodIdQuery } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import { FirmContext } from '../../http/context.js';
import { handler, paginated } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { params, query, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { Reminders } from '../requests/reminders.cron.js';
import { MessagesRepo } from './message.repo.js';

const list = route(
  'GET',
  '/messages',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const filters = yield* query(MessageListQuery);

      const { rows, total } = yield* MessagesRepo.use((repo) => repo.list(scope, filters));

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

      return yield* MessagesRepo.use((repo) => repo.failuresByPeriod(scope, periodId));
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
      const outcome = yield* MessagesRepo.use((repo) => repo.resend(scope, id));
      if (!outcome) return yield* Effect.fail(new NotFound('Mensagem não encontrada.'));

      /* Bug congelado #15: as quatro causas de "não enviou" existem no tipo mas o fio só
       * carrega o booleano. Distingui-las na resposta é follow-up, não esta migração. */
      return { sent: outcome._tag === 'Delivered' };
    }),
  ),
  { auth: firmRoute() },
);

/** Dispara a varredura de lembretes sob demanda, restrita à Contabilidade do chamador
 *  (AUTHZ-2). A varredura global continua sendo só do cron. */
const runReminders = route(
  'POST',
  '/messages/reminders/run',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* Reminders.use((reminders) => reminders.run(scope));
    }),
  ),
  { auth: firmRoute() },
);

export const messagesRoutes = Layer.mergeAll(list, failures, resend, runReminders);
