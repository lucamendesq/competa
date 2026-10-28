import * as Sentry from '@sentry/node';
import { Cause, Effect, Exit, Layer, Schedule } from 'effect';
import { Logger } from '../../lib/logger.js';

const logger = new Logger('Crons');

/** Sem fuso explícito o cron usaria o do processo, e a varredura andaria com o host. */
export const CRON_TIMEZONE = 'America/Sao_Paulo';

export const DEADLINE_CRON = '0 7 * * *';
export const BILLING_CRON = '30 7 * * *';
export const REMINDERS_CRON = '0 9 * * *';

const SENTRY_CHECKIN_MARGIN_MIN = 5;
const SENTRY_MAX_RUNTIME_MIN = 30;

/* O que o `Sentry.withMonitor` faz, mas com o job como Effect: check-in `in_progress`, o job
 * na própria fibra do cron, e o check-in final com a duração. Assim a interrupção do
 * shutdown alcança a varredura, e o `error` sai também quando ela é interrompida. */
const monitored = <E>(slug: string, expression: string, job: Effect.Effect<void, E>) =>
  Effect.suspend(() => {
    const checkInId = Sentry.captureCheckIn(
      { monitorSlug: slug, status: 'in_progress' },
      {
        schedule: { type: 'crontab', value: expression },
        checkinMargin: SENTRY_CHECKIN_MARGIN_MIN,
        maxRuntime: SENTRY_MAX_RUNTIME_MIN,
        timezone: CRON_TIMEZONE,
      },
    );
    const startedAt = Date.now();

    return job.pipe(
      Effect.onExit((exit) =>
        Effect.sync(() => {
          Sentry.captureCheckIn({
            monitorSlug: slug,
            status: Exit.isSuccess(exit) ? 'ok' : 'error',
            checkInId,
            duration: (Date.now() - startedAt) / 1000,
          });
        }),
      ),
    );
  });

/* `Effect.schedule` e não `Effect.repeat`: `repeat` roda o efeito UMA VEZ antes de
 * consultar o agendamento, e uma varredura a cada boot (incluindo cada arquivo da suíte)
 * seria errada. `orDie` porque, depois do catch, só sobra `CronParseError`: expressão
 * inválida tem de matar o processo no boot, não em silêncio às 7h. */
const scheduled = <E>(slug: string, expression: string, job: Effect.Effect<void, E>) =>
  monitored(slug, expression, job).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.interrupt
        : Effect.sync(() => {
            const error = Cause.squash(cause);
            logger.error(`cron ${slug} falhou`, error);
            Sentry.captureException(error);
          }),
    ),
    Effect.schedule(Schedule.cron(expression, CRON_TIMEZONE)),
    Effect.orDie,
    Effect.forkScoped,
  );

/** As varreduras diárias. As fibras morrem com o scope da layer: `close()` interrompe a
 *  varredura em curso, e a lease é devolvida no `ensuring` dela. */
export const cronsLayer = <E>(jobs: {
  readonly deadlines: Effect.Effect<void, E>;
  readonly billing: Effect.Effect<void, E>;
  readonly reminders: Effect.Effect<void, E>;
}) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* scheduled('deadline-daily', DEADLINE_CRON, jobs.deadlines);
      yield* scheduled('billing-daily', BILLING_CRON, jobs.billing);
      yield* scheduled('reminders-daily', REMINDERS_CRON, jobs.reminders);
    }),
  );
