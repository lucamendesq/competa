import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountingFirm,
  company,
  contact,
  documentType,
} from '../../src/infra/database/schema/index.js';
import { toContactScope, toFirmScope } from '../../src/modules/auth/scope.js';
import { PeriodsRepo } from '../../src/modules/periods/period.repo.js';
import { PeriodAlreadyClosed, PeriodAlreadyOpen } from '../../src/modules/periods/errors.js';

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

/** Firma + Empresa + Responsável no banco e uma Solicitação aberta com 1 item via
 *  openWithFanOut — o arranjo mínimo para exercitar as leituras do repositório. */
const seedOpenedRequest = (label: string) =>
  Effect.gen(function* () {
    const repo = yield* PeriodsRepo;
    const scope = yield* seedFirm(label);
    const companyName = `${label.replace('Unit ', '')} Ltda`;

    const seeded = yield* Effect.promise(async () => {
      const [comp] = await db
        .insert(company)
        .values({ accountingFirmId: scope, name: companyName })
        .returning({ id: company.id });
      const [resp] = await db
        .insert(contact)
        .values({
          companyId: comp.id,
          name: 'Resp',
          email: `${label.replace(' ', '-').toLowerCase()}@example.com`,
        })
        .returning({ id: contact.id });
      const [docType] = await db.select({ id: documentType.id }).from(documentType).limit(1);

      return { companyId: comp.id, contactId: resp.id, documentTypeId: docType.id };
    });

    const opened = yield* repo.openWithFanOut(scope, { referenceMonth: '2026-08-01' }, [
      {
        companyId: seeded.companyId,
        companyName,
        contactId: seeded.contactId,
        contactName: 'Resp',
        contactEmail: 'resp@example.com',
        contactPhone: null,
        token: `token-${label}`,
        tokenHash: `hash-${label}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        items: [
          {
            documentTypeId: seeded.documentTypeId,
            name: 'Doc Unit',
            description: null,
            acceptedFormats: ['pdf'],
            required: true,
            dueDate: null,
          },
        ],
      },
    ]);

    return { scope, periodId: opened.period.id, ...seeded };
  });

layer(PeriodsRepo.layer)('PeriodsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('openWithFanOut sem planos cria só a competência', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const scope = yield* seedFirm('Unit A');

      const opened = yield* repo.openWithFanOut(scope, { referenceMonth: '2026-01-01' }, []);

      expect(opened.period.referenceMonth).toBe('2026-01-01');
      expect(opened.period.status).toBe('open');
      expect(opened.requestIdByCompany.size).toBe(0);
    }),
  );

  it.effect('competência repetida na firma falha tipado com PeriodAlreadyOpen', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const scope = yield* seedFirm('Unit B');
      yield* repo.openWithFanOut(scope, { referenceMonth: '2026-02-01' }, []);

      const error = yield* repo
        .openWithFanOut(scope, { referenceMonth: '2026-02-01' }, [])
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(PeriodAlreadyOpen);
    }),
  );

  it.effect('closePeriod: inexistente → undefined; repetido → PeriodAlreadyClosed', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const scope = yield* seedFirm('Unit C');

      const missing = yield* repo.closePeriod(scope, '018f0000-0000-7000-8000-00000000beef');
      expect(missing).toBeUndefined();

      const { period: opened } = yield* repo.openWithFanOut(
        scope,
        { referenceMonth: '2026-03-01' },
        [],
      );
      const closed = yield* repo.closePeriod(scope, opened.id);
      expect(closed).toMatchObject({ status: 'closed', closedRequestCount: 0 });

      const error = yield* repo.closePeriod(scope, opened.id).pipe(Effect.flip);
      expect(error).toBeInstanceOf(PeriodAlreadyClosed);
    }),
  );

  it.effect('escopo de firma: findOwnedId e findById não vazam entre firmas', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const mine = yield* seedFirm('Unit D1');
      const other = yield* seedFirm('Unit D2');
      const { period: opened } = yield* repo.openWithFanOut(
        mine,
        { referenceMonth: '2026-04-01' },
        [],
      );

      expect(yield* repo.findOwnedId(mine, opened.id)).toBe(opened.id);
      expect(yield* repo.findOwnedId(other, opened.id)).toBeUndefined();
      expect(yield* repo.findById(other, opened.id)).toBeUndefined();
    }),
  );

  it.effect('openPeriod avisa empresa ativa sem template e não cria solicitação', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const scope = yield* seedFirm('Unit E');
      yield* Effect.promise(async () => {
        const [row] = await db
          .insert(company)
          .values({ accountingFirmId: scope, name: 'Sem Template' })
          .returning({ id: company.id });
        await db
          .insert(contact)
          .values({ companyId: row.id, name: 'Rita', email: 'rita@example.com' });
      });

      const opened = yield* repo.openPeriod(scope, { referenceMonth: '2026-05-01' });

      expect(opened.plans).toEqual([]);
      expect(opened.warnings).toMatchObject([
        { companyName: 'Sem Template', blockedBy: 'template' },
      ]);
      expect(opened.requestIdByCompany.size).toBe(0);
    }),
  );

  it.effect('listRequests: sem query devolve linhas; com query devolve { rows, total }', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const { scope, periodId } = yield* seedOpenedRequest('Unit G');

      const plain = yield* repo.listRequests(scope, periodId);
      expect(plain).toMatchObject([{ companyName: 'G Ltda', itemCount: 1, pendingItemCount: 1 }]);

      const paged = yield* repo.listRequests(scope, periodId, { page: 1, perPage: 10 });
      expect(paged).toMatchObject({ total: 1, rows: [{ companyName: 'G Ltda' }] });
    }),
  );

  it.effect('pendingPanel resume itens pendentes sem falhas de canal', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const { scope, periodId } = yield* seedOpenedRequest('Unit H');

      const panel = yield* repo.pendingPanel(scope, periodId);

      expect(panel).toMatchObject([
        {
          companyName: 'H Ltda',
          counts: { pending: 1, submitted: 0, accepted: 0, rejected: 0 },
          missing: [{ name: 'Doc Unit', status: 'pending' }],
          channelFailures: [],
        },
      ]);
    }),
  );

  it.effect('periods e periodDetail respondem pelo vínculo do Responsável', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const seeded = yield* seedOpenedRequest('Unit I');
      const contactScope = toContactScope([
        { contactId: seeded.contactId, companyId: seeded.companyId },
      ]);

      const mine = yield* repo.periods(contactScope, { page: 1, perPage: 10 });
      expect(mine.total).toBe(1);
      expect(mine.rows[0]).toMatchObject({
        periodId: seeded.periodId,
        companyId: seeded.companyId,
        itemCount: 1,
        pendingCount: 1,
      });

      const detail = yield* repo.periodDetail(contactScope, seeded.periodId);
      expect(detail).toMatchObject({
        periodId: seeded.periodId,
        items: [{ name: 'Doc Unit', documents: [] }],
        extraDocuments: [],
      });

      const stranger = toContactScope([
        { contactId: seeded.contactId, companyId: '018f0000-0000-7000-8000-00000000f00d' },
      ]);
      expect((yield* repo.periods(stranger, { page: 1, perPage: 10 })).total).toBe(0);
      expect(yield* repo.periodDetail(stranger, seeded.periodId)).toBeUndefined();
    }),
  );

  it.effect('list pagina por firma', () =>
    Effect.gen(function* () {
      const repo = yield* PeriodsRepo;
      const scope = yield* seedFirm('Unit F');
      yield* repo.openWithFanOut(scope, { referenceMonth: '2026-06-01' }, []);
      yield* repo.openWithFanOut(scope, { referenceMonth: '2026-07-01' }, []);

      const page1 = yield* repo.list(scope, { page: 1, perPage: 1 });
      expect(page1.total).toBe(2);
      expect(page1.rows).toHaveLength(1);
      expect(page1.rows[0].referenceMonth).toBe('2026-06-01');
    }),
  );
});
