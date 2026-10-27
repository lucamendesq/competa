import { Effect, Exit, Layer, Scope } from 'effect';
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
    deadlines: Effect.sync(() => {
      fired.push('deadline');
    }),
    reminders: Effect.sync(() => {
      fired.push('reminders');
    }),
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
      deadlines: Effect.suspend(() => {
        attempts += 1;
        return Effect.fail(new Error('banco fora'));
      }),
      reminders: Effect.void,
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

  /* Fechar o scope e avançar o relógio tem de acontecer no MESMO `TestClock`: cada
   * `TestClock.layer()` constrói um relógio novo, e uma fibra agendada no relógio A nunca
   * é alcançada avançando o relógio B — o teste passaria mesmo sem interrupção nenhuma. */
  it('o fim do scope interrompe as fibras', async () => {
    const jobs = fakes();

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(MIDNIGHT_SAO_PAULO);

        const scope = yield* Scope.make();
        yield* Layer.buildWithScope(cronsLayer(jobs), scope);
        yield* TestClock.adjust(0);

        // fecha ANTES das 7h
        yield* Scope.close(scope, Exit.void);

        yield* runUntil('2026-10-24T12:00:00.000Z');
        expect(jobs.fired, 'fibra interrompida não dispara').toEqual([]);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });

  it('o fim do scope interrompe a varredura EM CURSO e roda o finalizador dela', async () => {
    const steps: string[] = [];
    const jobs = {
      deadlines: Effect.sync(() => steps.push('começou')).pipe(
        Effect.andThen(Effect.sleep('1 hour')),
        Effect.andThen(Effect.sync(() => steps.push('terminou'))),
        Effect.ensuring(Effect.sync(() => steps.push('lease devolvida'))),
      ),
      reminders: Effect.void,
    };

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* TestClock.setTime(MIDNIGHT_SAO_PAULO);

        const scope = yield* Scope.make();
        yield* Layer.buildWithScope(cronsLayer(jobs), scope);
        yield* TestClock.adjust(0);

        yield* runUntil('2026-10-24T10:00:00.000Z');
        expect(steps).toEqual(['começou']);

        yield* Scope.close(scope, Exit.void);

        expect(steps).toEqual(['começou', 'lease devolvida']);
      }).pipe(Effect.provide(TestClock.layer())),
    );
  });
});
