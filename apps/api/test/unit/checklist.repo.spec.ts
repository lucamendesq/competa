import { layer } from '@effect/vitest';
import { Effect } from 'effect';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeAll, expect } from 'vitest';
import { db, truncateAll } from '../support/db.js';
import {
  accountingFirm,
  checklistTemplate,
  checklistTemplateItem,
  company,
  companyChecklistOverride,
  documentType,
} from '../../src/infra/database/schema/index.js';
import { toFirmScope } from '../../src/modules/auth/scope.js';
import { ValidationError } from '../../src/lib/app-error.js';
import { TemplateNameTaken } from '../../src/modules/checklists/errors.js';
import { ChecklistsRepo } from '../../src/modules/checklists/checklist.repo.js';

let seq = 0;

const seedFirm = (name: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(accountingFirm)
      .values({ name })
      .returning({ id: accountingFirm.id });

    return toFirmScope(row.id);
  });

const seedDocType = (
  firmId: string | null,
  name: string,
  opts: { category?: string; acceptedFormats?: string[]; description?: string } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(documentType)
      .values({
        accountingFirmId: firmId,
        name,
        category: opts.category ?? 'fiscal',
        acceptedFormats: opts.acceptedFormats ?? ['pdf'],
        description: opts.description ?? null,
      })
      .returning({ id: documentType.id });

    return row.id;
  });

const seedTemplate = (firmId: string | null, name: string, derivedFrom?: string) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(checklistTemplate)
      .values({ accountingFirmId: firmId, name, derivedFrom: derivedFrom ?? null })
      .returning({ id: checklistTemplate.id });

    return row.id;
  });

const seedItem = (
  templateId: string,
  documentTypeId: string,
  opts: {
    periodicity?: string;
    annualMonth?: number | null;
    dueDay?: number | null;
    dueMonthOffset?: number;
    conditionFlag?: string | null;
    required?: boolean;
  } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(checklistTemplateItem)
      .values({
        checklistTemplateId: templateId,
        documentTypeId,
        periodicity: opts.periodicity ?? 'monthly',
        annualMonth: opts.annualMonth ?? null,
        dueDay: opts.dueDay ?? null,
        dueMonthOffset: opts.dueMonthOffset ?? 1,
        conditionFlag: opts.conditionFlag ?? null,
        required: opts.required ?? true,
      })
      .returning({ id: checklistTemplateItem.id });

    return row.id;
  });

const seedCompany = (
  firmId: string,
  name: string,
  opts: {
    checklistTemplateId?: string | null;
    flags?: Record<string, boolean>;
    active?: boolean;
  } = {},
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(company)
      .values({
        accountingFirmId: firmId,
        name,
        checklistTemplateId: opts.checklistTemplateId ?? null,
        flags: opts.flags ?? {},
        active: opts.active ?? true,
      })
      .returning({ id: company.id });

    return row.id;
  });

const seedOverride = (
  companyId: string,
  documentTypeId: string,
  opts: {
    action: 'add' | 'remove';
    periodicity?: string | null;
    annualMonth?: number | null;
    dueDay?: number | null;
    dueMonthOffset?: number | null;
    conditionFlag?: string | null;
    required?: boolean | null;
  },
) =>
  Effect.promise(async () => {
    const [row] = await db
      .insert(companyChecklistOverride)
      .values({
        companyId,
        documentTypeId,
        action: opts.action,
        periodicity: opts.periodicity ?? null,
        annualMonth: opts.annualMonth ?? null,
        dueDay: opts.dueDay ?? null,
        dueMonthOffset: opts.dueMonthOffset ?? null,
        conditionFlag: opts.conditionFlag ?? null,
        required: opts.required ?? null,
      })
      .returning({ id: companyChecklistOverride.id });

    return row.id;
  });

const anyGlobalDocType = Effect.promise(async () => {
  const [row] = await db
    .select({ id: documentType.id, name: documentType.name, category: documentType.category })
    .from(documentType)
    .where(isNull(documentType.accountingFirmId))
    .orderBy(documentType.category, documentType.name)
    .limit(1);

  return row;
});

const addBody = (documentTypeId: string) => ({
  documentTypeId,
  periodicity: 'monthly' as const,
  annualMonth: null,
  dueDay: null,
  dueMonthOffset: 1,
  conditionFlag: null,
  required: true,
});

layer(ChecklistsRepo.layer)('ChecklistsRepo', (it) => {
  beforeAll(() => truncateAll());

  it.effect('listDocumentTypes: vê os do produto e os próprios, pagina, nunca os alheios', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DT ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma DT ${++seq}`);
      const ownId = yield* seedDocType(firmId, 'Doc Próprio DT', { category: 'fiscal' });
      const foreignId = yield* seedDocType(otherFirmId, 'Doc Alheio DT', { category: 'fiscal' });

      const fiscal = yield* repo.listDocumentTypes(firmId, {
        category: 'fiscal',
        page: 1,
        perPage: 100,
      });
      expect(fiscal.total).toBe(fiscal.rows.length);
      expect(fiscal.rows.every((row) => row.category === 'fiscal')).toBe(true);
      expect(fiscal.rows.find((row) => row.id === ownId)).toMatchObject({
        name: 'Doc Próprio DT',
        isProduct: false,
      });
      expect(fiscal.rows.some((row) => row.isProduct)).toBe(true);
      expect(fiscal.rows.find((row) => row.id === foreignId)).toBeUndefined();

      const page1 = yield* repo.listDocumentTypes(firmId, {
        category: 'fiscal',
        page: 1,
        perPage: 2,
      });
      const page2 = yield* repo.listDocumentTypes(firmId, {
        category: 'fiscal',
        page: 2,
        perPage: 2,
      });
      expect(page1.total).toBe(fiscal.total);
      expect(page1.rows).toEqual(fiscal.rows.slice(0, 2));
      expect(page2.rows).toEqual(fiscal.rows.slice(2, 4));

      const all = yield* repo.listDocumentTypes(firmId, { page: 1, perPage: 100 });
      expect(all.total).toBeGreaterThan(fiscal.total);
    }),
  );

  it.effect('documentTypesVisible filtra para os ids do produto e da própria firm', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DV ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma DV ${++seq}`);
      const ownId = yield* seedDocType(firmId, 'Doc Próprio DV');
      const foreignId = yield* seedDocType(otherFirmId, 'Doc Alheio DV');
      const globalRow = yield* anyGlobalDocType;

      const visible = yield* repo.documentTypesVisible(firmId, [ownId, foreignId, globalRow.id]);
      expect(visible.toSorted()).toEqual([ownId, globalRow.id].toSorted());
      expect(yield* repo.documentTypesVisible(firmId, [foreignId])).toEqual([]);
    }),
  );

  it.effect('listTemplates agrega itens e só empresas ativas da firm; alheio não aparece', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma LT ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma LT ${++seq}`);
      const docA = yield* seedDocType(firmId, 'LT Doc A');
      const docB = yield* seedDocType(firmId, 'LT Doc B');
      const ownId = yield* seedTemplate(firmId, 'LT Próprio');
      yield* seedItem(ownId, docA);
      yield* seedItem(ownId, docB);
      yield* seedCompany(firmId, 'LT Ativa', { checklistTemplateId: ownId });
      yield* seedCompany(firmId, 'LT Inativa', { checklistTemplateId: ownId, active: false });
      const foreignId = yield* seedTemplate(otherFirmId, 'LT Alheio');

      const rows = yield* repo.listTemplates(firmId);
      expect(rows.find((row) => row.id === ownId)).toMatchObject({
        name: 'LT Próprio',
        isProduct: false,
        itemCount: 2,
        companyCount: 1,
      });
      const product = rows.filter((row) => row.isProduct);
      expect(product.length).toBeGreaterThan(0);
      expect(product.every((row) => row.companyCount === 0)).toBe(true);
      expect(rows.find((row) => row.id === foreignId)).toBeUndefined();
    }),
  );

  it.effect('findTemplate enxerga o do produto e o próprio; o alheio é undefined', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma FT ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma FT ${++seq}`);
      const globalId = yield* seedTemplate(null, `FT Global ${seq}`);
      const ownId = yield* seedTemplate(firmId, 'FT Próprio', globalId);
      const foreignId = yield* seedTemplate(otherFirmId, 'FT Alheio');

      expect(yield* repo.findTemplate(firmId, ownId)).toEqual({
        id: ownId,
        name: 'FT Próprio',
        derivedFrom: globalId,
        accountingFirmId: firmId,
      });
      expect(yield* repo.findTemplate(firmId, globalId)).toMatchObject({
        id: globalId,
        accountingFirmId: null,
      });
      expect(yield* repo.findTemplate(firmId, foreignId)).toBeUndefined();
    }),
  );

  it.effect('listTemplateItems devolve a forma completa ordenada por categoria e nome', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma LI ${++seq}`);
      const docFiscal = yield* seedDocType(firmId, 'LI Zeta', {
        category: 'fiscal',
        acceptedFormats: ['xml', 'pdf'],
        description: 'Notas do mês',
      });
      const docExpense = yield* seedDocType(firmId, 'LI Alfa', { category: 'expense' });
      const templateId = yield* seedTemplate(firmId, 'LI Template');
      const itemFiscal = yield* seedItem(templateId, docFiscal, {
        periodicity: 'annual',
        annualMonth: 5,
        dueDay: 20,
        dueMonthOffset: 2,
        conditionFlag: 'has_employees',
        required: false,
      });
      const itemExpense = yield* seedItem(templateId, docExpense);

      const items = yield* repo.listTemplateItems(templateId);
      expect(items).toEqual([
        {
          id: itemExpense,
          documentTypeId: docExpense,
          name: 'LI Alfa',
          category: 'expense',
          description: null,
          acceptedFormats: ['pdf'],
          periodicity: 'monthly',
          annualMonth: null,
          dueDay: null,
          dueMonthOffset: 1,
          conditionFlag: null,
          required: true,
        },
        {
          id: itemFiscal,
          documentTypeId: docFiscal,
          name: 'LI Zeta',
          category: 'fiscal',
          description: 'Notas do mês',
          acceptedFormats: ['xml', 'pdf'],
          periodicity: 'annual',
          annualMonth: 5,
          dueDay: 20,
          dueMonthOffset: 2,
          conditionFlag: 'has_employees',
          required: false,
        },
      ]);
    }),
  );

  it.effect('listItemsForTemplates: [] sem ids; linhas carregam checklistTemplateId', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma IT ${++seq}`);
      const docA = yield* seedDocType(firmId, 'IT Doc A');
      const docB = yield* seedDocType(firmId, 'IT Doc B');
      const tplA = yield* seedTemplate(firmId, 'IT Tpl A');
      const tplB = yield* seedTemplate(firmId, 'IT Tpl B');
      yield* seedItem(tplA, docA);
      yield* seedItem(tplB, docB);

      expect(yield* repo.listItemsForTemplates([])).toEqual([]);

      const rows = yield* repo.listItemsForTemplates([tplA, tplB]);
      expect(rows).toHaveLength(2);
      expect(rows.map((row) => [row.checklistTemplateId, row.documentTypeId])).toEqual(
        expect.arrayContaining([
          [tplA, docA],
          [tplB, docB],
        ]),
      );
      /* Forma consumida pelo merge do openPeriod (ChecklistLine + checklistTemplateId). */
      expect(Object.keys(rows[0]).toSorted()).toEqual([
        'acceptedFormats',
        'annualMonth',
        'category',
        'checklistTemplateId',
        'conditionFlag',
        'description',
        'documentTypeId',
        'dueDay',
        'dueMonthOffset',
        'id',
        'name',
        'periodicity',
        'required',
      ]);
    }),
  );

  it.effect('templateItemsForCompany não vaza itens de template de outro tenant', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma TC ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma TC ${++seq}`);
      const docOwn = yield* seedDocType(firmId, 'TC Doc Próprio');
      const docForeign = yield* seedDocType(otherFirmId, 'TC Doc Alheio');
      const ownTpl = yield* seedTemplate(firmId, 'TC Próprio');
      const foreignTpl = yield* seedTemplate(otherFirmId, 'TC Alheio');
      yield* seedItem(ownTpl, docOwn);
      yield* seedItem(foreignTpl, docForeign);

      const okCompany = yield* seedCompany(firmId, 'TC Ok', { checklistTemplateId: ownTpl });
      expect(yield* repo.templateItemsForCompany(firmId, okCompany)).toMatchObject([
        { documentTypeId: docOwn, name: 'TC Doc Próprio' },
      ]);

      /* Vínculo inconsistente (empresa minha apontando para template alheio): nada vaza. */
      const leaky = yield* seedCompany(firmId, 'TC Vazada', { checklistTemplateId: foreignTpl });
      expect(yield* repo.templateItemsForCompany(firmId, leaky)).toEqual([]);

      expect(yield* repo.templateItemsForCompany(otherFirmId, okCompany)).toEqual([]);
    }),
  );

  it.effect('listOverrides e listOverridesForCompanies devolvem a forma do merge', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma LO ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma LO ${++seq}`);
      const docA = yield* seedDocType(firmId, 'LO Doc A');
      const docB = yield* seedDocType(firmId, 'LO Doc B');
      const companyA = yield* seedCompany(firmId, 'LO Empresa A');
      const companyB = yield* seedCompany(firmId, 'LO Empresa B');
      const foreignCompany = yield* seedCompany(otherFirmId, 'LO Alheia');
      const overrideA = yield* seedOverride(companyA, docA, {
        action: 'add',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      });
      yield* seedOverride(companyB, docB, { action: 'remove' });
      yield* seedOverride(foreignCompany, docA, { action: 'remove' });

      const single = yield* repo.listOverrides(firmId, companyA);
      expect(single).toEqual([
        {
          id: overrideA,
          action: 'add',
          documentTypeId: docA,
          name: 'LO Doc A',
          category: 'fiscal',
          description: null,
          acceptedFormats: ['pdf'],
          periodicity: 'monthly',
          annualMonth: null,
          dueDay: null,
          dueMonthOffset: 1,
          conditionFlag: null,
          required: true,
        },
      ]);
      expect(yield* repo.listOverrides(otherFirmId, companyA)).toEqual([]);

      expect(yield* repo.listOverridesForCompanies(firmId, [])).toEqual([]);

      const many = yield* repo.listOverridesForCompanies(firmId, [
        companyA,
        companyB,
        foreignCompany,
      ]);
      expect(many.map((row) => [row.companyId, row.action])).toEqual(
        expect.arrayContaining([
          [companyA, 'add'],
          [companyB, 'remove'],
        ]),
      );
      expect(many).toHaveLength(2);
    }),
  );

  it.effect('createTemplate: grava na firm; nome repetido (case-insensitive) → 409 tipado', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma CT ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma CT ${++seq}`);

      const created = yield* repo.createTemplate(firmId, {
        name: 'CT Fiscal',
        derivedFrom: null,
      });
      expect(created).toMatchObject({
        name: 'CT Fiscal',
        derivedFrom: null,
        accountingFirmId: firmId,
      });

      const taken = yield* repo
        .createTemplate(firmId, { name: 'ct fiscal', derivedFrom: null })
        .pipe(Effect.flip);
      expect(taken).toBeInstanceOf(TemplateNameTaken);

      const elsewhere = yield* repo.createTemplate(otherFirmId, {
        name: 'CT Fiscal',
        derivedFrom: null,
      });
      expect(elsewhere.accountingFirmId).toBe(otherFirmId);
    }),
  );

  it.effect('copyItems copia a carga toda e devolve quantos foram', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma CI ${++seq}`);
      const docA = yield* seedDocType(firmId, 'CI Doc A');
      const docB = yield* seedDocType(firmId, 'CI Doc B');
      const source = yield* seedTemplate(firmId, 'CI Origem');
      const target = yield* seedTemplate(firmId, 'CI Destino');
      const empty = yield* seedTemplate(firmId, 'CI Vazio');
      yield* seedItem(source, docA, { periodicity: 'annual', annualMonth: 3, dueDay: 15 });
      yield* seedItem(source, docB);

      expect(yield* repo.copyItems(source, target)).toBe(2);
      const copied = yield* repo.listTemplateItems(target);
      expect(copied.map((row) => [row.documentTypeId, row.periodicity, row.annualMonth])).toEqual(
        expect.arrayContaining([
          [docA, 'annual', 3],
          [docB, 'monthly', null],
        ]),
      );

      expect(yield* repo.copyItems(empty, target)).toBe(0);
    }),
  );

  it.effect('renameTemplate: só o próprio; global fica intacto; colisão → 409 tipado', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma RT ${++seq}`);
      const ownId = yield* seedTemplate(firmId, 'RT Antigo');
      yield* seedTemplate(firmId, 'RT Ocupado');
      const globalId = yield* seedTemplate(null, `RT Global ${seq}`);

      expect(yield* repo.renameTemplate(firmId, ownId, 'RT Novo')).toEqual({
        id: ownId,
        name: 'RT Novo',
        derivedFrom: null,
        accountingFirmId: firmId,
      });

      const taken = yield* repo.renameTemplate(firmId, ownId, 'rt ocupado').pipe(Effect.flip);
      expect(taken).toBeInstanceOf(TemplateNameTaken);

      expect(yield* repo.renameTemplate(firmId, globalId, 'RT Invadido')).toBeUndefined();
      const [globalRow] = yield* Effect.promise(() =>
        db
          .select({ name: checklistTemplate.name })
          .from(checklistTemplate)
          .where(eq(checklistTemplate.id, globalId)),
      );
      expect(globalRow.name, 'template do produto não muda').toBe(`RT Global ${seq}`);
    }),
  );

  it.effect('deriveTemplate copia itens, aponta derivedFrom e herda o nome da origem', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DE ${++seq}`);
      const docA = yield* seedDocType(firmId, 'DE Doc A');
      const docB = yield* seedDocType(firmId, 'DE Doc B');
      const sourceId = yield* seedTemplate(null, `DE Origem ${seq}`);
      yield* seedItem(sourceId, docA, { conditionFlag: 'has_inventory' });
      yield* seedItem(sourceId, docB, { required: false });

      const derived = yield* repo.deriveTemplate(firmId, {
        id: sourceId,
        name: `DE Origem ${seq}`,
      });
      expect(derived).toMatchObject({
        name: `DE Origem ${seq}`,
        derivedFrom: sourceId,
        accountingFirmId: firmId,
        itemCount: 2,
      });

      const items = yield* repo.listTemplateItems(derived.id);
      expect(items.map((row) => [row.documentTypeId, row.conditionFlag, row.required])).toEqual(
        expect.arrayContaining([
          [docA, 'has_inventory', true],
          [docB, null, false],
        ]),
      );

      const named = yield* repo.deriveTemplate(
        firmId,
        { id: sourceId, name: `DE Origem ${seq}` },
        'DE Batizado',
      );
      expect(named).toMatchObject({ name: 'DE Batizado', derivedFrom: sourceId, itemCount: 2 });
    }),
  );

  it.effect('deriveTemplate: colisão de nome falha tipado e não deixa template pela metade', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DC ${++seq}`);
      const sourceId = yield* seedTemplate(null, `DC Origem ${seq}`);
      yield* repo.deriveTemplate(firmId, { id: sourceId, name: `DC Origem ${seq}` });

      const taken = yield* repo
        .deriveTemplate(firmId, { id: sourceId, name: `DC Origem ${seq}` })
        .pipe(Effect.flip);
      expect(taken).toBeInstanceOf(TemplateNameTaken);

      const mine = yield* Effect.promise(() =>
        db
          .select({ id: checklistTemplate.id })
          .from(checklistTemplate)
          .where(eq(checklistTemplate.accountingFirmId, firmId)),
      );
      expect(mine, 'transação não deixa segunda cópia').toHaveLength(1);
    }),
  );

  it.effect('addTemplateItem: grava no próprio; global/alheio e tipo repetido → undefined', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma AI ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma AI ${++seq}`);
      const docId = yield* seedDocType(firmId, 'AI Doc');
      const ownTpl = yield* seedTemplate(firmId, 'AI Próprio');
      const foreignTpl = yield* seedTemplate(otherFirmId, 'AI Alheio');
      const globalTpl = yield* seedTemplate(null, `AI Global ${seq}`);

      const row = yield* repo.addTemplateItem(firmId, ownTpl, {
        documentTypeId: docId,
        periodicity: 'annual',
        annualMonth: 12,
        dueDay: 10,
        dueMonthOffset: 0,
        conditionFlag: 'has_employees',
        required: false,
      });
      expect(row).toMatchObject({
        checklistTemplateId: ownTpl,
        documentTypeId: docId,
        periodicity: 'annual',
        annualMonth: 12,
        dueDay: 10,
        dueMonthOffset: 0,
        conditionFlag: 'has_employees',
        required: false,
      });

      expect(yield* repo.addTemplateItem(firmId, ownTpl, addBody(docId))).toBeUndefined();
      expect(yield* repo.addTemplateItem(firmId, globalTpl, addBody(docId))).toBeUndefined();
      expect(yield* repo.addTemplateItem(firmId, foreignTpl, addBody(docId))).toBeUndefined();

      const globalItems = yield* repo.listTemplateItems(globalTpl);
      expect(globalItems, 'template do produto não ganha item').toEqual([]);
    }),
  );

  it.effect('updateTemplateItem: anual sem annualMonth → 422; global → undefined', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma UI ${++seq}`);
      const docId = yield* seedDocType(firmId, 'UI Doc');
      const globalDoc = yield* seedDocType(null, `UI Doc Global ${seq}`);
      const ownTpl = yield* seedTemplate(firmId, 'UI Próprio');
      const globalTpl = yield* seedTemplate(null, `UI Global ${seq}`);
      const ownItem = yield* seedItem(ownTpl, docId, { periodicity: 'annual', annualMonth: 6 });
      const globalItem = yield* seedItem(globalTpl, globalDoc);

      const updated = yield* repo.updateTemplateItem(firmId, ownTpl, ownItem, { dueDay: 25 });
      expect(updated).toMatchObject({ id: ownItem, dueDay: 25, periodicity: 'annual' });

      const invalid = yield* repo
        .updateTemplateItem(firmId, ownTpl, ownItem, { annualMonth: null })
        .pipe(Effect.flip);
      expect(invalid).toBeInstanceOf(ValidationError);
      expect(invalid).toMatchObject({ message: 'Item anual exige annualMonth.' });

      const demoted = yield* repo.updateTemplateItem(firmId, ownTpl, ownItem, {
        periodicity: 'monthly',
        annualMonth: null,
      });
      expect(demoted).toMatchObject({ periodicity: 'monthly', annualMonth: null });

      expect(
        yield* repo.updateTemplateItem(firmId, globalTpl, globalItem, { dueDay: 9 }),
      ).toBeUndefined();
      const [globalRow] = yield* Effect.promise(() =>
        db
          .select({ dueDay: checklistTemplateItem.dueDay })
          .from(checklistTemplateItem)
          .where(eq(checklistTemplateItem.id, globalItem)),
      );
      expect(globalRow.dueDay, 'item do produto não muda').toBeNull();
    }),
  );

  it.effect('deleteTemplateItem: remove do próprio; global sobrevive e devolve undefined', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DI ${++seq}`);
      const docId = yield* seedDocType(firmId, 'DI Doc');
      const globalDoc = yield* seedDocType(null, `DI Doc Global ${seq}`);
      const ownTpl = yield* seedTemplate(firmId, 'DI Próprio');
      const globalTpl = yield* seedTemplate(null, `DI Global ${seq}`);
      const ownItem = yield* seedItem(ownTpl, docId);
      const globalItem = yield* seedItem(globalTpl, globalDoc);

      expect(yield* repo.deleteTemplateItem(firmId, globalTpl, globalItem)).toBeUndefined();
      expect(yield* repo.listTemplateItems(globalTpl)).toHaveLength(1);

      expect(yield* repo.deleteTemplateItem(firmId, ownTpl, ownItem)).toEqual({ id: ownItem });
      expect(yield* repo.listTemplateItems(ownTpl)).toEqual([]);
    }),
  );

  it.effect('upsertOverride: insere, atualiza a mesma linha e anula campos no remove', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma UO ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma UO ${++seq}`);
      const docId = yield* seedDocType(firmId, 'UO Doc');
      const companyId = yield* seedCompany(firmId, 'UO Empresa');

      const created = yield* repo.upsertOverride(firmId, companyId, {
        documentTypeId: docId,
        action: 'add',
        periodicity: 'annual',
        annualMonth: 2,
        dueDay: 5,
        dueMonthOffset: 1,
        conditionFlag: null,
        required: true,
      });
      expect(created).toMatchObject({
        companyId,
        documentTypeId: docId,
        action: 'add',
        periodicity: 'annual',
        annualMonth: 2,
      });

      const updated = yield* repo.upsertOverride(firmId, companyId, {
        documentTypeId: docId,
        action: 'add',
        periodicity: 'monthly',
        annualMonth: null,
        dueDay: 7,
        dueMonthOffset: 0,
        conditionFlag: 'has_inventory',
        required: false,
      });
      expect(updated).toMatchObject({
        id: created!.id,
        periodicity: 'monthly',
        annualMonth: null,
        dueDay: 7,
        dueMonthOffset: 0,
        conditionFlag: 'has_inventory',
        required: false,
      });

      const removed = yield* repo.upsertOverride(firmId, companyId, {
        documentTypeId: docId,
        action: 'remove',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      });
      expect(removed).toMatchObject({
        id: created!.id,
        action: 'remove',
        periodicity: null,
        annualMonth: null,
        dueDay: null,
        dueMonthOffset: null,
        conditionFlag: null,
        required: null,
      });

      expect(
        yield* repo.upsertOverride(otherFirmId, companyId, {
          documentTypeId: docId,
          action: 'add',
          periodicity: 'monthly',
          dueMonthOffset: 1,
          required: true,
        }),
      ).toBeUndefined();
    }),
  );

  it.effect('deleteOverride respeita o escopo da firm', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DO ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma DO ${++seq}`);
      const docId = yield* seedDocType(firmId, 'DO Doc');
      const companyId = yield* seedCompany(firmId, 'DO Empresa');
      const overrideId = yield* seedOverride(companyId, docId, { action: 'remove' });

      expect(yield* repo.deleteOverride(otherFirmId, companyId, docId)).toBeUndefined();
      expect(yield* repo.listOverrides(firmId, companyId)).toHaveLength(1);

      expect(yield* repo.deleteOverride(firmId, companyId, docId)).toEqual({ id: overrideId });
      expect(yield* repo.deleteOverride(firmId, companyId, docId)).toBeUndefined();
    }),
  );

  it.effect('companyChecklistContext traz flags e template; fora da firm → undefined', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma CC ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma CC ${++seq}`);
      const templateId = yield* seedTemplate(firmId, 'CC Modelo');
      const withTpl = yield* seedCompany(firmId, 'CC Com Modelo', {
        checklistTemplateId: templateId,
        flags: { has_employees: true },
      });
      const without = yield* seedCompany(firmId, 'CC Sem Modelo');

      expect(yield* repo.companyChecklistContext(firmId, withTpl)).toEqual({
        id: withTpl,
        flags: { has_employees: true },
        checklistTemplateId: templateId,
        templateName: 'CC Modelo',
      });
      expect(yield* repo.companyChecklistContext(firmId, without)).toMatchObject({
        checklistTemplateId: null,
        templateName: null,
      });
      expect(yield* repo.companyChecklistContext(otherFirmId, withTpl)).toBeUndefined();
    }),
  );

  it.effect('effectiveChecklist: remove tira, add entra, add parcial herda só o que é null', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma EC ${++seq}`);
      const docKept = yield* seedDocType(firmId, 'EC Mantido', { category: 'expense' });
      const docRemoved = yield* seedDocType(firmId, 'EC Removido');
      const docOverridden = yield* seedDocType(firmId, 'EC Sobrescrito');
      const docAdded = yield* seedDocType(firmId, 'EC Extra');
      const templateId = yield* seedTemplate(firmId, 'EC Modelo');
      yield* seedItem(templateId, docKept);
      yield* seedItem(templateId, docRemoved);
      yield* seedItem(templateId, docOverridden, {
        periodicity: 'annual',
        annualMonth: 5,
        dueDay: 20,
        conditionFlag: 'has_employees',
        required: false,
      });
      const companyId = yield* seedCompany(firmId, 'EC Empresa', {
        checklistTemplateId: templateId,
        flags: { has_inventory: true },
      });
      yield* seedOverride(companyId, docRemoved, { action: 'remove' });
      /* Override parcial como o PUT grava hoje: os defaults do zod vão non-null e só
       * annualMonth/dueDay/conditionFlag chegam null para herdar do template. */
      yield* seedOverride(companyId, docOverridden, {
        action: 'add',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      });
      yield* seedOverride(companyId, docAdded, {
        action: 'add',
        periodicity: 'monthly',
        dueDay: 8,
        dueMonthOffset: 0,
        conditionFlag: 'has_inventory',
        required: true,
      });

      const checklist = yield* repo.effectiveChecklist(firmId, companyId);
      expect(checklist).toMatchObject({
        companyId,
        template: { id: templateId, name: 'EC Modelo' },
        flags: { has_inventory: true },
      });
      expect(checklist!.items.map((line) => line.name)).toEqual([
        'EC Mantido',
        'EC Extra',
        'EC Sobrescrito',
      ]);
      expect(checklist!.items[0]).toMatchObject({ source: 'template', applies: true });
      expect(checklist!.items[1]).toMatchObject({
        source: 'override',
        dueDay: 8,
        conditionFlag: 'has_inventory',
        applies: true,
      });
      expect(checklist!.items[2]).toMatchObject({
        source: 'override',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
        annualMonth: 5,
        dueDay: 20,
        conditionFlag: 'has_employees',
        applies: false,
      });
    }),
  );

  it.effect('effectiveChecklist sem template usa só overrides; empresa alheia → undefined', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma E2 ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma E2 ${++seq}`);
      const docId = yield* seedDocType(firmId, 'E2 Avulso');
      const companyId = yield* seedCompany(firmId, 'E2 Empresa');
      yield* seedOverride(companyId, docId, {
        action: 'add',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      });

      const checklist = yield* repo.effectiveChecklist(firmId, companyId);
      expect(checklist).toMatchObject({ template: null });
      expect(checklist!.items).toMatchObject([
        { name: 'E2 Avulso', source: 'override', applies: true },
      ]);

      expect(yield* repo.effectiveChecklist(otherFirmId, companyId)).toBeUndefined();
    }),
  );

  it.effect('countCompaniesUsingTemplate conta inclusive inativas, só da própria firm', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma CU ${++seq}`);
      const otherFirmId = yield* seedFirm(`Firma CU ${++seq}`);
      const globalTpl = yield* seedTemplate(null, `CU Global ${seq}`);
      yield* seedCompany(firmId, 'CU Ativa', { checklistTemplateId: globalTpl });
      yield* seedCompany(firmId, 'CU Inativa', { checklistTemplateId: globalTpl, active: false });
      yield* seedCompany(otherFirmId, 'CU Alheia', { checklistTemplateId: globalTpl });

      expect(yield* repo.countCompaniesUsingTemplate(firmId, globalTpl)).toBe(2);
      expect(yield* repo.countCompaniesUsingTemplate(otherFirmId, globalTpl)).toBe(1);
    }),
  );

  it.effect('deleteTemplate apaga o próprio com itens em cascata; global fica de pé', () =>
    Effect.gen(function* () {
      const repo = yield* ChecklistsRepo;
      const firmId = yield* seedFirm(`Firma DT2 ${++seq}`);
      const docId = yield* seedDocType(firmId, 'DT2 Doc');
      const ownTpl = yield* seedTemplate(firmId, 'DT2 Próprio');
      const globalTpl = yield* seedTemplate(null, `DT2 Global ${seq}`);
      const itemId = yield* seedItem(ownTpl, docId);

      expect(yield* repo.deleteTemplate(firmId, globalTpl)).toBeUndefined();
      expect(yield* repo.findTemplate(firmId, globalTpl)).toBeDefined();

      expect(yield* repo.deleteTemplate(firmId, ownTpl)).toEqual({ id: ownTpl });
      const leftover = yield* Effect.promise(() =>
        db
          .select({ id: checklistTemplateItem.id })
          .from(checklistTemplateItem)
          .where(
            and(
              eq(checklistTemplateItem.id, itemId),
              eq(checklistTemplateItem.checklistTemplateId, ownTpl),
            ),
          ),
      );
      expect(leftover, 'itens caem em cascata').toEqual([]);
    }),
  );
});
