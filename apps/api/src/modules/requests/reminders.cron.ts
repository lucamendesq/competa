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

  /** Lembretes de UMA Contabilidade, lidos e enviados sob a lease dela. Ler fora da lease
   *  deixava dois runs (dois cliques, ou um clique durante o cron) lerem a mesma contagem de
   *  lembretes e mandarem o mesmo duas vezes, gastando o teto de 2 da Solicitação. */
  const sweepFirm = (firmId: FirmScope) =>
    requests.withLease(
      `${REMINDERS_CRON_LEASE}:${firmId}`,
      Effect.gen(function* () {
        const candidates = yield* requests.reminderCandidates(firmId);
        const settingsByFirm = yield* requests.reminderSettingsByFirm([firmId]);
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

            /* Esperado, não disparado: a lease só é devolvida quando a varredura termina, e
             * é a linha de `message` escrita pelo listener que o próximo candidato lê. Soltar
             * a lease com o envio em voo deixava outra instância (ou o run manual) reenviar
             * o mesmo lembrete. */
            yield* events.emitAsync(EVENTS.ReminderDue, event);
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

        return { scanned: candidates.length, sent };
      }),
    );

  const runSweep = (scope?: FirmScope) =>
    Effect.gen(function* () {
      const firmIds = scope
        ? [scope]
        : ([
            ...new Set((yield* requests.reminderCandidates()).map((row) => row.accountingFirmId)),
          ] as FirmScope[]);

      let scanned = 0;
      let sent = 0;
      let busy = false;

      for (const firmId of firmIds) {
        const result = yield* sweepFirm(firmId);
        if (result === null) {
          busy = true;
          continue;
        }
        scanned += result.scanned;
        sent += result.sent;
      }

      logger.log(`lembretes: ${sent} de ${scanned} Solicitações elegíveis`);

      /* `busy`: outra varredura segura a lease de alguma Contabilidade agora. */
      return { scanned, sent, busy };
    });

  /** Agendada em `crons.ts` (`0 9 * * *`, America/Sao_Paulo). A lease global evita duas
   *  instâncias varrendo juntas; `run`, usada por `POST /messages/reminders/run` com escopo
   *  de firma, disputa só a lease da Contabilidade — a mesma que o cron toma por firma. */
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
