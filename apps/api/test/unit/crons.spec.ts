import { Effect, Layer } from 'effect';
import { TestClock } from 'effect/testing';
import { describe, expect, it } from 'vitest';
import {
  CRON_TIMEZONE,
  DEADLINE_CRON,
  REMINDERS_CRON,
  cronsLayer,
} from '../../src/modules/requests/crons.js';

/* 2026-10-24T03:00:00Z é 2026-10-24 00:00 em America/Sao_Paulo (UTC-3). As horas abaixo
 * são escolhidas para separar "7h em São Paulo" (10:00Z) de "7h em UTC" (07:00Z): se o
 * fuso não fosse aplicado, as duas varreduras disparariam três horas antes. */
const MIDNIGHT_SAO_PAULO = Date.parse('2026-10-24T03:00:00.000Z');

const fakes = () => {
  const fired: string[] = [];

  return {
    fired,
    deadlines: {
      daily: () => {
        fired.push('deadline');
        return Promise.resolve();
      },
    },
    reminders: {
      scheduled: () => {
        fired.push('reminders');
        return Promise.resolve();
      },
    },
  };
};

const runUntil = (iso: string) =>
  Effect.gen(function* () {
    yield* TestClock.setTime(Date.parse(iso));
    // deixa as fibras acordadas pelo relógio rodarem até suspender de novo
    yield* TestClock.adjust(0);
  });

describe('crons: agendamento em Schedule.cron', () => {
  /* O fuso é afirmado como constante porque a prova de comportamento abaixo só distingue
   * "America/Sao_Paulo" de "fuso do processo" quando o host NÃO está em UTC-3. */
  it('usa as expressões e o fuso dos @Cron do @nestjs/schedule', () => {
    expect(DEADLINE_CRON).toBe('0 7 * * *');
    expect(REMINDERS_CRON).toBe('0 9 * * *');
    expect(CRON_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('dispara às 7h e às 9h de America/Sao_Paulo, nunca no boot', async () => {
    const jobs = fakes();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* TestClock.setTime(MIDNIGHT_SAO_PAULO);
          yield* Layer.build(cronsLayer(jobs));
          yield* TestClock.adjust(0);

          /* `Effect.repeat` rodaria uma varredura aqui — em produção a cada deploy, na
           * suíte a cada arquivo. É por isso que o agendamento usa `Effect.schedule`. */
          expect(jobs.fired, 'nada dispara no boot').toEqual([]);

          // 1s antes das 7h em São Paulo — e já passado das 7h em UTC
          yield* runUntil('2026-10-24T09:59:59.000Z');
          expect(jobs.fired, 'o fuso é respeitado: 7h UTC não dispara').toEqual([]);

          yield* runUntil('2026-10-24T10:00:00.000Z');
          expect(jobs.fired).toEqual(['deadline']);

          yield* runUntil('2026-10-24T11:59:59.000Z');
          expect(jobs.fired).toEqual(['deadline']);

          yield* runUntil('2026-10-24T12:00:00.000Z');
          expect(jobs.fired).toEqual(['deadline', 'reminders']);

          // dia seguinte: as duas repetem, uma vez cada
          yield* runUntil('2026-10-25T12:00:00.000Z');
          expect(jobs.fired).toEqual(['deadline', 'reminders', 'deadline', 'reminders']);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );
  });

  it('a varredura que falha não derruba o agendamento', async () => {
    let attempts = 0;
    const jobs = {
      deadlines: {
        daily: () => {
          attempts += 1;
          return Promise.reject(new Error('banco fora'));
        },
      },
      reminders: { scheduled: () => Promise.resolve() },
    };

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* TestClock.setTime(MIDNIGHT_SAO_PAULO);
          yield* Layer.build(cronsLayer(jobs));
          yield* TestClock.adjust(0);

          yield* runUntil('2026-10-24T10:00:00.000Z');
          expect(attempts).toBe(1);

          yield* runUntil('2026-10-25T10:00:00.000Z');
          expect(attempts, 'o dia seguinte continua agendado').toBe(2);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );
  });

  it('o fim do scope interrompe as fibras', async () => {
    const jobs = fakes();

    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          yield* TestClock.setTime(MIDNIGHT_SAO_PAULO);
          yield* Layer.build(cronsLayer(jobs));
          yield* TestClock.adjust(0);
        }),
      ).pipe(Effect.provide(TestClock.layer())),
    );

    // o scope fechou antes das 7h; nenhuma fibra sobreviveu para disparar
    await Effect.runPromise(
      Effect.scoped(runUntil('2026-10-24T12:00:00.000Z')).pipe(Effect.provide(TestClock.layer())),
    );

    expect(jobs.fired).toEqual([]);
  });
});
