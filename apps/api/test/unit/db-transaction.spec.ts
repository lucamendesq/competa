import { layer } from '@effect/vitest';
import { eq } from 'drizzle-orm';
import { Cause, Effect, Exit, Fiber, Latch, Layer } from 'effect';
import { beforeAll, expect } from 'vitest';
import { Db } from '../../src/infra/database/effect.js';
import { DbUnavailable } from '../../src/infra/database/error.js';
import { accountingFirm, company } from '../../src/infra/database/schema/index.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';
import { ChecklistsRepo } from '../../src/modules/checklists/checklist.repo.js';
import { CompaniesRepo } from '../../src/modules/companies/company.repo.js';
import { PeriodsRepo } from '../../src/modules/periods/period.repo.js';
import { db, truncateAll } from '../support/db.js';

class Boom {
  readonly _tag = 'Boom';
}

const TestLayer = Layer.mergeAll(CompaniesRepo.layerNoDeps, PeriodsRepo.layerNoDeps).pipe(
  Layer.provideMerge(ChecklistsRepo.layerNoDeps),
  Layer.provideMerge(Db.layer),
);

/** Conta pelo pool, fora de qualquer transação: é o único jeito de afirmar o que de fato
 *  commitou. */
const committedFirms = (name: string) =>
  Effect.promise(async () => {
    const rows = await db
      .select({ id: accountingFirm.id })
      .from(accountingFirm)
      .where(eq(accountingFirm.name, name));

    return rows.length;
  });

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

layer(TestLayer)('Db.withTransaction', (it) => {
  beforeAll(() => truncateAll());

  const insertFirm = (name: string) =>
    Effect.flatMap(Db, (database) =>
      database.use(async (d) => {
        await d.insert(accountingFirm).values({ name });
      }),
    );

  it.effect('sucesso commita e devolve o valor', () =>
    Effect.gen(function* () {
      const database = yield* Db;

      const value = yield* database.withTransaction(
        Effect.as(insertFirm('tx-commit'), 'pronto' as const),
      );

      expect(value).toBe('pronto');
      expect(yield* committedFirms('tx-commit')).toBe(1);
    }),
  );

  it.effect('erro tipado desfaz e chega inteiro no canal de erro', () =>
    Effect.gen(function* () {
      const database = yield* Db;

      const error = yield* database
        .withTransaction(Effect.andThen(insertFirm('tx-fail'), Effect.fail(new Boom())))
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(Boom);
      expect(error).not.toBeInstanceOf(DbUnavailable);
      expect(yield* committedFirms('tx-fail')).toBe(0);
    }),
  );

  it.effect('defeito desfaz e continua defeito', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const defect = new Error('explodiu dentro da transação');

      const exit = yield* database
        .withTransaction(Effect.andThen(insertFirm('tx-die'), Effect.die(defect)))
        .pipe(Effect.exit);

      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true);
      expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined).toBe(defect);
      expect(yield* committedFirms('tx-die')).toBe(0);
    }),
  );

  it.effect('interrupção desfaz: nada commita pela metade', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const firmId = yield* seedFirm('tx-interrupt');
      const written = yield* Latch.make();

      const fiber = yield* Effect.forkChild(
        database.withTransaction(
          Effect.andThen(
            database.use(async (d) => {
              await d
                .update(accountingFirm)
                .set({ name: 'tx-interrupt-escrito' })
                .where(eq(accountingFirm.id, firmId));
            }),
            Effect.andThen(written.open, Effect.never),
          ),
        ),
      );

      yield* written.await;
      yield* Fiber.interrupt(fiber);

      /* O UPDATE pelo pool só passa se a transação interrompida tiver SOLTADO o lock da
       * linha: deixada aberta, esta instrução esperaria até o `statement_timeout`. */
      const nameAfter = yield* Effect.promise(async () => {
        const [row] = await db
          .update(accountingFirm)
          .set({ contactEmail: 'depois@example.com' })
          .where(eq(accountingFirm.id, firmId))
          .returning({ name: accountingFirm.name });

        return row.name;
      });

      expect(nameAfter).toBe('tx-interrupt');
      expect(yield* committedFirms('tx-interrupt-escrito')).toBe(0);
    }),
  );

  it.effect('aninhada vira savepoint: o de dentro desfaz, o de fora commita', () =>
    Effect.gen(function* () {
      const database = yield* Db;

      yield* database.withTransaction(
        Effect.andThen(
          insertFirm('tx-outer'),
          database
            .withTransaction(Effect.andThen(insertFirm('tx-inner'), Effect.fail(new Boom())))
            .pipe(Effect.catch(() => Effect.void)),
        ),
      );

      expect(yield* committedFirms('tx-outer')).toBe(1);
      expect(yield* committedFirms('tx-inner')).toBe(0);
    }),
  );

  it.effect('método de repositório participa sem receber a transação', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const repo = yield* CompaniesRepo;
      const scope = yield* seedFirm('Firma Ambiente');

      const visibleDuring = yield* database.withTransaction(
        Effect.gen(function* () {
          yield* repo.create(scope, { name: 'Ambiente Ltda', flags: {} });

          /* Leitura pelo POOL, não pela transação: se a empresa já aparecesse aqui, o
           * `create` não teria entrado na transação de quem o chamou. */
          return yield* Effect.promise(async () => {
            const rows = await db
              .select({ id: company.id })
              .from(company)
              .where(eq(company.accountingFirmId, scope));

            return rows.length;
          });
        }),
      );

      expect(visibleDuring).toBe(0);

      const committed = yield* Effect.promise(() =>
        db.select({ id: company.id }).from(company).where(eq(company.accountingFirmId, scope)),
      );
      expect(committed).toHaveLength(1);
    }),
  );

  it.effect('dois repositórios numa transação só desfazem juntos', () =>
    Effect.gen(function* () {
      const database = yield* Db;
      const companies = yield* CompaniesRepo;
      const periods = yield* PeriodsRepo;
      const scope = yield* seedFirm('Firma Composta');

      yield* periods.openWithFanOut(scope, { referenceMonth: '2026-09-01' }, []);

      const error = yield* database
        .withTransaction(
          Effect.andThen(
            companies.create(scope, { name: 'Composta Ltda', flags: {} }),
            periods.openWithFanOut(scope, { referenceMonth: '2026-09-01' }, []),
          ),
        )
        .pipe(Effect.flip);

      expect(error).toMatchObject({ name: 'PeriodAlreadyOpen' });

      const companies_ = yield* Effect.promise(() =>
        db.select({ id: company.id }).from(company).where(eq(company.accountingFirmId, scope)),
      );
      expect(companies_).toHaveLength(0);
    }),
  );
});
