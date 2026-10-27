import { layer } from '@effect/vitest';
import { sql } from 'drizzle-orm';
import { Cause, Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';
import { mapError } from '../../src/http/error-map.js';
import { Db } from '../../src/infra/database/effect.js';
import { DbUnavailable, UniqueViolation, classify } from '../../src/infra/database/error.js';

/** O formato que o pg devolve, embrulhado como o drizzle embrulha. */
const driverError = (fields: { code?: string; constraint?: string; message?: string }) => {
  const pg = Object.assign(new Error(fields.message ?? 'erro do pg'), fields);
  return new Error('Failed query: ...', { cause: pg });
};

describe('classify', () => {
  it('23505 vira UniqueViolation com a constraint', () => {
    const classified = classify(driverError({ code: '23505', constraint: 'company_cnpj_uidx' }));

    expect(classified).toBeInstanceOf(UniqueViolation);
    expect((classified as UniqueViolation).constraint).toBe('company_cnpj_uidx');
  });

  it('serialização e deadlock são DbUnavailable repetível', () => {
    for (const code of ['40001', '40P01']) {
      expect(classify(driverError({ code }))).toMatchObject({
        _tag: 'DbUnavailable',
        retryable: true,
      });
    }
  });

  it('conexão e servidor caindo são DbUnavailable', () => {
    for (const code of ['08006', '57P01', '53300', '57014']) {
      expect(classify(driverError({ code }))).toBeInstanceOf(DbUnavailable);
    }
    expect(classify(driverError({ code: 'ECONNREFUSED' }))).toMatchObject({ retryable: true });
    expect(classify(driverError({ code: 'ECONNRESET' }))).toMatchObject({ retryable: false });
    expect(classify(new Error('timeout exceeded when trying to connect'))).toMatchObject({
      _tag: 'DbUnavailable',
      retryable: true,
    });
  });

  it('o resto é defeito', () => {
    expect(classify(driverError({ code: '22P02' }))).toBeUndefined();
    expect(classify(new Error('bug'))).toBeUndefined();
  });
});

describe('mapError — banco fora do ar', () => {
  it('DbUnavailable responde 503 sem vazar o erro do driver', () => {
    const mapped = mapError(new DbUnavailable({ retryable: true, cause: new Error('pg caiu') }));

    expect(mapped).toEqual({
      status: 503,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'Banco indisponível. Tente novamente.' },
    });
  });
});

layer(Db.layer)('Db.use e Db.attempt contra o banco', (it) => {
  const divisionByZero = (d: Parameters<Parameters<Db['Service']['use']>[0]>[0]) =>
    d.execute(sql`select 1/0`);

  it.effect('attempt entrega a violação de unicidade no canal', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const error = yield* database
        .attempt((d) =>
          d.execute(
            sql`create temp table uniq_probe (x int unique); insert into uniq_probe values (1), (1)`,
          ),
        )
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(UniqueViolation);
    }),
  );

  it.effect('use trata a mesma violação como defeito', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const exit = yield* database
        .use((d) =>
          d.execute(
            sql`create temp table uniq_probe2 (x int unique); insert into uniq_probe2 values (1), (1)`,
          ),
        )
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    }),
  );

  it.effect('erro de SQL comum é defeito nos dois', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const exit = yield* database.attempt(divisionByZero).pipe(Effect.exit);

      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
    }),
  );
});
