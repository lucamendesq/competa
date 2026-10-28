import { Logger } from '../../lib/logger.js';
import * as Sentry from '@sentry/node';
import { Context, Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { squashError } from '../../infra/database/error.js';
import { EVENTS, type ReminderDueEvent } from '../../lib/events.js';
import { Events } from '../../lib/events.service.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { pickReminders } from '../messaging/reminder-rules.js';
import { RequestsRepo } from './request.repo.js';

const REMINDERS_CRON_LEASE = 'reminders-sweep';

const logger = new Logger('RemindersCron');

const make = Effect.gen(function* () {
  const events = yield* Events;
  const requests = yield* RequestsRepo;

  const runSweep = (scope?: FirmScope) =>
    Effect.gen(function* () {
      const candidates = yield* requests.reminderCandidates(scope);
      const settingsByFirm = yield* requests.reminderSettingsByFirm([
        ...new Set(candidates.map((row) => row.accountingFirmId)),
      ]);
      const due = pickReminders(candidates, new Date(), settingsByFirm);

      let sent = 0;

      for (const candidate of due) {
        yield* Effect.gen(function* () {
          const { token, tokenHash } = createToken();
          const uploadUrl = `${env.WEB_URL}/envio/${token}`;

          yield* requests.applyUploadToken(candidate.requestId, tokenHash);

          const event: ReminderDueEvent = {
            requestId: candidate.requestId,
            referenceMonth: candidate.referenceMonth,
            periodDueDate: candidate.periodDueDate,
            companyName: candidate.companyName,
            contactName: candidate.contactName,
            contactEmail: candidate.contactEmail,
            uploadUrl,
            pendingItems: candidate.pendingItems,
          };

          yield* events.emit(EVENTS.ReminderDue, event);
          sent += 1;
        }).pipe(
          Effect.catchCause((cause) =>
            Effect.sync(() => {
              const error = squashError(cause);
              logger.error(
                `Falha ao processar lembrete da Solicitação ${candidate.requestId}: ${String(error)}`,
                error,
              );
              Sentry.captureException(error);
            }),
          ),
        );
      }

      logger.log(`lembretes: ${sent} de ${candidates.length} Solicitações elegíveis`);

      return { scanned: candidates.length, sent };
    });

  /** Agendada em `crons.ts` (`0 9 * * *`, America/Sao_Paulo). `run` é a versão sem lock,
   *  usada por `POST /messages/reminders/run` com escopo de firma. */
  const scheduled = () =>
    Effect.gen(function* () {
      const ran = yield* requests.withLease(REMINDERS_CRON_LEASE, Effect.as(runSweep(), true));

      if (!ran) logger.warn('lembretes: varredura pulada — lock tomado por outra instância');
    });

  return { scheduled, run: runSweep };
});

export class Reminders extends Context.Service<Reminders, Effect.Success<typeof make>>()(
  'competa/api/requests/Reminders',
) {
  static readonly layer = Layer.effect(Reminders, make);
}
