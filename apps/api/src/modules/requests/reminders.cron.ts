import { Logger } from '../../lib/logger.js';
import type { EventEmitter2 } from '../../lib/event-emitter.js';
import * as Sentry from '@sentry/node';
import { Effect } from 'effect';
import env from '../../config/env.js';
import { run, squashError } from '../../effect/runtime.js';
import { EVENTS, type ReminderDueEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import type { FirmScope } from '../auth/scope.js';
import { pickReminders } from '../messaging/reminder-rules.js';
import { RequestsRepo } from './request.repo.js';

const REMINDERS_CRON_LOCK_ID = 42001;

const logger = new Logger('RemindersCron');

export const remindersCron = (events: EventEmitter2) => {
  const runSweep = (scope?: FirmScope) =>
    Effect.gen(function* () {
      const requests = yield* RequestsRepo;

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

          events.emit(EVENTS.ReminderDue, event);
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

  /** Agendada em `crons.ts` (`0 9 * * *`, America/Sao_Paulo). `run()` é a versão sem lock,
   *  usada por `POST /messages/reminders/run` com escopo de firma. */
  const scheduled = () =>
    Effect.gen(function* () {
      const requests = yield* RequestsRepo;

      const ran = yield* requests.withAdvisoryLock(REMINDERS_CRON_LOCK_ID, () =>
        run(Effect.as(runSweep(), true)),
      );

      if (!ran) logger.warn('lembretes: varredura pulada — lock tomado por outra instância');
    });

  return { scheduled, run: runSweep };
};

export type RemindersCron = ReturnType<typeof remindersCron>;
