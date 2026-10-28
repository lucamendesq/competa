import * as Sentry from '@sentry/node';
import { Effect, Layer, Schedule } from 'effect';

/** O `timeZone` que os `@Cron(...)` passavam. Sem ele o fuso é o do processo, e a
 *  varredura andaria com o host. */
export const CRON_TIMEZONE = 'America/Sao_Paulo';

/** Mesma expressão do `CronExpression.EVERY_DAY_AT_7AM`/`_9AM` do agendador do Nest. */
export const DEADLINE_CRON = '0 7 * * *';
export const REMINDERS_CRON = '0 9 * * *';

/* `@SentryCron(slug, config)` é literalmente `Sentry.withMonitor(slug, () => método(), config)`
 * (`@sentry/nestjs/build/cjs/decorators.js:8`) — o check-in some se a chamada sair daqui. */
const monitored = (slug: string, expression: string, job: () => Promise<void>) =>
  Effect.promise(() =>
    Sentry.withMonitor(slug, job, {
      schedule: { type: 'crontab', value: expression },
      checkinMargin: 5,
      maxRuntime: 30,
      timezone: CRON_TIMEZONE,
    }),
  );

/* `Effect.schedule` e não `Effect.repeat`: `repeat` roda o efeito UMA VEZ antes de
 * consultar o agendamento, e uma varredura a cada boot (incluindo cada arquivo da suíte)
 * não é o que o `@Cron` fazia. `orDie` porque, depois do catch, só sobra `CronParseError`:
 * expressão inválida tem de matar o processo no boot, não em silêncio às 7h. */
const scheduled = (slug: string, expression: string, job: () => Promise<void>) =>
  monitored(slug, expression, job).pipe(
    Effect.catchCause((cause) => Effect.logError(`cron ${slug} falhou`, cause)),
    Effect.schedule(Schedule.cron(expression, CRON_TIMEZONE)),
    Effect.orDie,
    Effect.forkScoped,
  );

/** As duas varreduras diárias. As fibras morrem com o scope da layer, que é o do
 *  `ManagedRuntime` de `createApp` — `close()` interrompe a varredura em curso, como o
 *  shutdown hook do Nest fazia. */
export const cronsLayer = (jobs: {
  readonly deadlines: { daily(): Promise<void> };
  readonly reminders: { scheduled(): Promise<void> };
}) =>
  Layer.effectDiscard(
    Effect.gen(function* () {
      yield* scheduled('deadline-daily', DEADLINE_CRON, () => jobs.deadlines.daily());
      yield* scheduled('reminders-daily', REMINDERS_CRON, () => jobs.reminders.scheduled());
    }),
  );
