import { Context, Effect, Layer } from 'effect';
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type {
  CreateOverrideBody,
  CreateTemplateItemBody,
  UpdateTemplateItemBody,
} from '@competa/contracts';
import { Db, type Executor } from '../../infra/database/effect.js';
import {
  checklistTemplate,
  checklistTemplateItem,
  company,
  companyChecklistOverride,
  documentType,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';
import {
  appliesToFlags,
  mergeEffectiveChecklist,
  type ChecklistLine,
} from './effective-checklist.js';
import { ValidationError } from '../../lib/app-error.js';
import { TemplateNameTaken } from './errors.js';
import type { UniqueViolation } from '../../infra/database/error.js';

const visibleTo = (scope: FirmScope, column: PgColumn) => or(isNull(column), eq(column, scope))!;

const itemColumns = {
  id: checklistTemplateItem.id,
  documentTypeId: documentType.id,
  name: documentType.name,
  category: documentType.category,
  description: documentType.description,
  acceptedFormats: documentType.acceptedFormats,
  periodicity: checklistTemplateItem.periodicity,
  annualMonth: checklistTemplateItem.annualMonth,
  dueDay: checklistTemplateItem.dueDay,
  dueMonthOffset: checklistTemplateItem.dueMonthOffset,
  conditionFlag: checklistTemplateItem.conditionFlag,
  required: checklistTemplateItem.required,
};

const nameTakenOrDie = (violation: UniqueViolation) =>
  violation.constraint === 'checklist_template_firm_name_uidx'
    ? Effect.fail(new TemplateNameTaken())
    : Effect.die(violation.cause);

const make = Effect.gen(function* () {
  const db = yield* Db;

  const listDocumentTypes = Effect.fn('ChecklistsRepo.listDocumentTypes')(function* (
    scope: FirmScope,
    query: { category?: string; page: number; perPage: number },
  ) {
    const where = and(
      visibleTo(scope, documentType.accountingFirmId),
      query.category ? eq(documentType.category, query.category) : undefined,
    );

    return yield* db.use(async (d) => {
      const [rows, [total]] = await Promise.all([
        d
          .select({
            id: documentType.id,
            name: documentType.name,
            category: documentType.category,
            acceptedFormats: documentType.acceptedFormats,
            description: documentType.description,
            isProduct: isNull(documentType.accountingFirmId),
          })
          .from(documentType)
          .where(where)
          .orderBy(documentType.category, documentType.name)
          .limit(query.perPage)
          .offset((query.page - 1) * query.perPage),
        d.select({ value: count() }).from(documentType).where(where),
      ]);

      return { rows, total: total.value };
    });
  });

  const documentTypesVisible = Effect.fn('ChecklistsRepo.documentTypesVisible')(function* (
    scope: FirmScope,
    ids: string[],
  ) {
    return yield* db.use(async (d) => {
      const rows = await d
        .select({ id: documentType.id })
        .from(documentType)
        .where(and(inArray(documentType.id, ids), visibleTo(scope, documentType.accountingFirmId)));

      return rows.map((row) => row.id);
    });
  });

  const listTemplates = Effect.fn('ChecklistsRepo.listTemplates')(function* (scope: FirmScope) {
    return yield* db.use((d) =>
      d
        .select({
          id: checklistTemplate.id,
          name: checklistTemplate.name,
          derivedFrom: checklistTemplate.derivedFrom,
          isProduct: isNull(checklistTemplate.accountingFirmId),
          itemCount: sql<number>`cast(count(distinct ${checklistTemplateItem.id}) as int)`,
          companyCount: sql<number>`cast(count(distinct ${company.id}) as int)`,
        })
        .from(checklistTemplate)
        .leftJoin(
          checklistTemplateItem,
          eq(checklistTemplateItem.checklistTemplateId, checklistTemplate.id),
        )
        .leftJoin(
          company,
          and(
            eq(company.checklistTemplateId, checklistTemplate.id),
            eq(company.accountingFirmId, scope),
            eq(company.active, true),
          ),
        )
        .where(visibleTo(scope, checklistTemplate.accountingFirmId))
        .groupBy(
          checklistTemplate.id,
          checklistTemplate.name,
          checklistTemplate.derivedFrom,
          checklistTemplate.accountingFirmId,
        )
        .orderBy(checklistTemplate.name),
    );
  });

  const findTemplate = Effect.fn('ChecklistsRepo.findTemplate')(function* (
    scope: FirmScope,
    templateId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .select({
          id: checklistTemplate.id,
          name: checklistTemplate.name,
          derivedFrom: checklistTemplate.derivedFrom,
          accountingFirmId: checklistTemplate.accountingFirmId,
        })
        .from(checklistTemplate)
        .where(
          and(
            eq(checklistTemplate.id, templateId),
            visibleTo(scope, checklistTemplate.accountingFirmId),
          ),
        )
        .limit(1);

      return row;
    });
  });

  const listTemplateItems = Effect.fn('ChecklistsRepo.listTemplateItems')(function* (
    templateId: string,
  ) {
    return yield* db.use((d) =>
      d
        .select(itemColumns)
        .from(checklistTemplateItem)
        .innerJoin(documentType, eq(documentType.id, checklistTemplateItem.documentTypeId))
        .where(eq(checklistTemplateItem.checklistTemplateId, templateId))
        .orderBy(documentType.category, documentType.name),
    );
  });

  const listItemsForTemplates = Effect.fn('ChecklistsRepo.listItemsForTemplates')(function* (
    templateIds: string[],
  ) {
    if (templateIds.length === 0) return [];

    return yield* db.use((d) =>
      d
        .select({
          ...itemColumns,
          checklistTemplateId: checklistTemplateItem.checklistTemplateId,
        })
        .from(checklistTemplateItem)
        .innerJoin(documentType, eq(documentType.id, checklistTemplateItem.documentTypeId))
        .where(inArray(checklistTemplateItem.checklistTemplateId, templateIds))
        .orderBy(documentType.category, documentType.name),
    );
  });

  const templateItemsForCompanyOn = (d: Executor, scope: FirmScope, companyId: string) =>
    d
      .select(itemColumns)
      .from(company)
      .leftJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
      .leftJoin(
        checklistTemplateItem,
        eq(checklistTemplateItem.checklistTemplateId, checklistTemplate.id),
      )
      .innerJoin(documentType, eq(documentType.id, checklistTemplateItem.documentTypeId))
      /* O predicado sobre o template, e não só sobre a empresa: um vínculo inconsistente
       * vindo de script ou migração vazaria itens de template de outro tenant. */
      .where(
        and(
          eq(company.id, companyId),
          eq(company.accountingFirmId, scope),
          or(
            isNull(checklistTemplate.accountingFirmId),
            eq(checklistTemplate.accountingFirmId, scope),
          ),
        ),
      )
      .orderBy(documentType.category, documentType.name);

  const templateItemsForCompany = Effect.fn('ChecklistsRepo.templateItemsForCompany')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use((d) => templateItemsForCompanyOn(d, scope, companyId));
  });

  const listOverridesOn = (d: Executor, scope: FirmScope, companyId: string) =>
    d
      .select({
        id: companyChecklistOverride.id,
        action: companyChecklistOverride.action,
        documentTypeId: documentType.id,
        name: documentType.name,
        category: documentType.category,
        description: documentType.description,
        acceptedFormats: documentType.acceptedFormats,
        periodicity: companyChecklistOverride.periodicity,
        annualMonth: companyChecklistOverride.annualMonth,
        dueDay: companyChecklistOverride.dueDay,
        dueMonthOffset: companyChecklistOverride.dueMonthOffset,
        conditionFlag: companyChecklistOverride.conditionFlag,
        required: companyChecklistOverride.required,
      })
      .from(companyChecklistOverride)
      .innerJoin(company, eq(company.id, companyChecklistOverride.companyId))
      .innerJoin(documentType, eq(documentType.id, companyChecklistOverride.documentTypeId))
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .orderBy(documentType.category, documentType.name);

  const listOverrides = Effect.fn('ChecklistsRepo.listOverrides')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use((d) => listOverridesOn(d, scope, companyId));
  });

  const listOverridesForCompanies = Effect.fn('ChecklistsRepo.listOverridesForCompanies')(
    function* (scope: FirmScope, companyIds: string[]) {
      if (companyIds.length === 0) return [];

      return yield* db.use((d) =>
        d
          .select({
            id: companyChecklistOverride.id,
            companyId: companyChecklistOverride.companyId,
            action: companyChecklistOverride.action,
            documentTypeId: documentType.id,
            name: documentType.name,
            category: documentType.category,
            description: documentType.description,
            acceptedFormats: documentType.acceptedFormats,
            periodicity: companyChecklistOverride.periodicity,
            annualMonth: companyChecklistOverride.annualMonth,
            dueDay: companyChecklistOverride.dueDay,
            dueMonthOffset: companyChecklistOverride.dueMonthOffset,
            conditionFlag: companyChecklistOverride.conditionFlag,
            required: companyChecklistOverride.required,
          })
          .from(companyChecklistOverride)
          .innerJoin(company, eq(company.id, companyChecklistOverride.companyId))
          .innerJoin(documentType, eq(documentType.id, companyChecklistOverride.documentTypeId))
          .where(and(inArray(company.id, companyIds), eq(company.accountingFirmId, scope)))
          .orderBy(documentType.category, documentType.name),
      );
    },
  );

  const createTemplateOn = async (
    d: Executor,
    scope: FirmScope,
    input: { name: string; derivedFrom: string | null },
  ) => {
    const [row] = await d
      .insert(checklistTemplate)
      .values({ ...input, accountingFirmId: scope })
      .returning();

    return row;
  };

  const createTemplate = Effect.fn('ChecklistsRepo.createTemplate')(function* (
    scope: FirmScope,
    input: { name: string; derivedFrom: string | null },
  ) {
    return yield* db
      .attempt((d) => createTemplateOn(d, scope, input))
      .pipe(Effect.catchTag('UniqueViolation', nameTakenOrDie));
  });

  const copyItemsOn = async (d: Executor, fromTemplateId: string, toTemplateId: string) => {
    const result = await d.execute(sql`
      insert into checklist_template_item (
        id, checklist_template_id, document_type_id, periodicity,
        annual_month, due_day, due_month_offset, condition_flag, required, created_at, updated_at
      )
      select
        gen_random_uuid(), ${toTemplateId}, document_type_id, periodicity,
        annual_month, due_day, due_month_offset, condition_flag, required, now(), now()
      from checklist_template_item
      where checklist_template_id = ${fromTemplateId}
    `);

    return Number(result.rowCount ?? 0);
  };

  const copyItems = Effect.fn('ChecklistsRepo.copyItems')(function* (
    fromTemplateId: string,
    toTemplateId: string,
  ) {
    return yield* db.use((d) => copyItemsOn(d, fromTemplateId, toTemplateId));
  });

  /** Só o modelo da própria Contabilidade (o controller garante com `requireOwned`): o do
   *  produto é compartilhado por todos os tenants. */
  const renameTemplate = Effect.fn('ChecklistsRepo.renameTemplate')(function* (
    scope: FirmScope,
    templateId: string,
    name: string,
  ) {
    return yield* db
      .attempt(async (d) => {
        const [row] = await d
          .update(checklistTemplate)
          .set({ name })
          .where(
            and(
              eq(checklistTemplate.id, templateId),
              eq(checklistTemplate.accountingFirmId, scope),
            ),
          )
          .returning({
            id: checklistTemplate.id,
            name: checklistTemplate.name,
            derivedFrom: checklistTemplate.derivedFrom,
            accountingFirmId: checklistTemplate.accountingFirmId,
          });

        return row;
      })
      .pipe(Effect.catchTag('UniqueViolation', nameTakenOrDie));
  });

  const deriveTemplate = Effect.fn('ChecklistsRepo.deriveTemplate')(function* (
    scope: FirmScope,
    source: { id: string; name: string },
    name?: string,
  ) {
    return yield* db
      .withTransaction(
        db.attempt(async (tx) => {
          const derived = await createTemplateOn(tx, scope, {
            name: name ?? source.name,
            derivedFrom: source.id,
          });

          const itemCount = await copyItemsOn(tx, source.id, derived.id);

          return { ...derived, itemCount };
        }),
      )
      .pipe(Effect.catchTag('UniqueViolation', nameTakenOrDie));
  });

  const addTemplateItem = Effect.fn('ChecklistsRepo.addTemplateItem')(function* (
    scope: FirmScope,
    templateId: string,
    body: CreateTemplateItemBody,
  ) {
    return yield* db.use(async (d) => {
      const [tpl] = await d
        .select({ id: checklistTemplate.id })
        .from(checklistTemplate)
        .where(
          and(eq(checklistTemplate.id, templateId), eq(checklistTemplate.accountingFirmId, scope)),
        )
        .limit(1);

      if (!tpl) return undefined;

      const [row] = await d
        .insert(checklistTemplateItem)
        .values({ ...body, checklistTemplateId: templateId })
        // unique(checklist_template_id, document_type_id): repetir o Tipo de Documento é
        // conflito de negócio (409), não erro de servidor — quem decide é o controller.
        .onConflictDoNothing()
        .returning();

      return row;
    });
  });

  const ownedTemplateFilter = (d: Executor, scope: FirmScope, templateId: string) =>
    inArray(
      checklistTemplateItem.checklistTemplateId,
      d
        .select({ id: checklistTemplate.id })
        .from(checklistTemplate)
        .where(
          and(eq(checklistTemplate.id, templateId), eq(checklistTemplate.accountingFirmId, scope)),
        ),
    );

  const updateTemplateItem = Effect.fn('ChecklistsRepo.updateTemplateItem')(function* (
    scope: FirmScope,
    templateId: string,
    itemId: string,
    body: UpdateTemplateItemBody,
  ) {
    if (body.annualMonth === null && body.periodicity === undefined) {
      const [existing] = yield* db.use((d) =>
        d
          .select({ periodicity: checklistTemplateItem.periodicity })
          .from(checklistTemplateItem)
          .where(
            and(
              eq(checklistTemplateItem.id, itemId),
              eq(checklistTemplateItem.checklistTemplateId, templateId),
              ownedTemplateFilter(d, scope, templateId),
            ),
          ),
      );
      if (existing?.periodicity === 'annual') {
        return yield* Effect.fail(new ValidationError('Item anual exige annualMonth.'));
      }
    }

    return yield* db.use(async (d) => {
      const [row] = await d
        .update(checklistTemplateItem)
        .set(body)
        .where(
          and(
            eq(checklistTemplateItem.id, itemId),
            eq(checklistTemplateItem.checklistTemplateId, templateId),
            ownedTemplateFilter(d, scope, templateId),
          ),
        )
        .returning();

      return row;
    });
  });

  const deleteTemplateItem = Effect.fn('ChecklistsRepo.deleteTemplateItem')(function* (
    scope: FirmScope,
    templateId: string,
    itemId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .delete(checklistTemplateItem)
        .where(
          and(
            eq(checklistTemplateItem.id, itemId),
            eq(checklistTemplateItem.checklistTemplateId, templateId),
            ownedTemplateFilter(d, scope, templateId),
          ),
        )
        .returning({ id: checklistTemplateItem.id });

      return row;
    });
  });

  const upsertOverride = Effect.fn('ChecklistsRepo.upsertOverride')(function* (
    scope: FirmScope,
    companyId: string,
    body: CreateOverrideBody,
  ) {
    return yield* db.use(async (d) => {
      const [comp] = await d
        .select({ id: company.id })
        .from(company)
        .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
        .limit(1);

      if (!comp) return undefined;

      const values =
        body.action === 'remove'
          ? {
              documentTypeId: body.documentTypeId,
              action: 'remove' as const,
              periodicity: null,
              annualMonth: null,
              dueDay: null,
              dueMonthOffset: null,
              conditionFlag: null,
              required: null,
            }
          : body;

      const [row] = await d
        .insert(companyChecklistOverride)
        .values({ ...values, companyId })
        .onConflictDoUpdate({
          target: [companyChecklistOverride.companyId, companyChecklistOverride.documentTypeId],
          set: {
            action: sql`excluded.action`,
            periodicity: sql`excluded.periodicity`,
            annualMonth: sql`excluded.annual_month`,
            dueDay: sql`excluded.due_day`,
            dueMonthOffset: sql`excluded.due_month_offset`,
            conditionFlag: sql`excluded.condition_flag`,
            required: sql`excluded.required`,
          },
        })
        .returning();

      return row;
    });
  });

  const deleteOverride = Effect.fn('ChecklistsRepo.deleteOverride')(function* (
    scope: FirmScope,
    companyId: string,
    documentTypeId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .delete(companyChecklistOverride)
        .where(
          and(
            eq(companyChecklistOverride.companyId, companyId),
            eq(companyChecklistOverride.documentTypeId, documentTypeId),
            inArray(
              companyChecklistOverride.companyId,
              d
                .select({ id: company.id })
                .from(company)
                .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope))),
            ),
          ),
        )
        .returning({ id: companyChecklistOverride.id });

      return row;
    });
  });

  const companyChecklistContextOn = async (d: Executor, scope: FirmScope, companyId: string) => {
    const [row] = await d
      .select({
        id: company.id,
        flags: company.flags,
        checklistTemplateId: company.checklistTemplateId,
        templateName: checklistTemplate.name,
      })
      .from(company)
      .leftJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .limit(1);

    return row;
  };

  const companyChecklistContext = Effect.fn('ChecklistsRepo.companyChecklistContext')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use((d) => companyChecklistContextOn(d, scope, companyId));
  });

  const effectiveChecklist = Effect.fn('ChecklistsRepo.effectiveChecklist')(function* (
    scope: FirmScope,
    companyId: string,
  ) {
    return yield* db.use(async (d) => {
      const context = await companyChecklistContextOn(d, scope, companyId);
      if (!context) return undefined;

      const [templateItems, overrides] = await Promise.all([
        context.checklistTemplateId
          ? templateItemsForCompanyOn(d, scope, companyId)
          : Promise.resolve([]),
        listOverridesOn(d, scope, companyId),
      ]);

      const lines = mergeEffectiveChecklist(templateItems as ChecklistLine[], overrides);

      return {
        companyId,
        template: context.checklistTemplateId
          ? { id: context.checklistTemplateId, name: context.templateName! }
          : null,
        flags: context.flags,
        items: lines.map((line) => ({
          ...line,
          applies: appliesToFlags(line, context.flags),
        })),
      };
    });
  });

  const countCompaniesUsingTemplate = Effect.fn('ChecklistsRepo.countCompaniesUsingTemplate')(
    function* (scope: FirmScope, templateId: string) {
      return yield* db.use(async (d) => {
        const [row] = await d
          .select({ count: count(company.id) })
          .from(company)
          .where(
            and(eq(company.checklistTemplateId, templateId), eq(company.accountingFirmId, scope)),
          );

        return Number(row?.count ?? 0);
      });
    },
  );

  /* Os itens caem por `onDelete: 'cascade'` na FK. Apagá-los antes, numa query sem filtro
   * de firm, commitava a perda mesmo quando o delete escopado do template não casava. */
  const deleteTemplate = Effect.fn('ChecklistsRepo.deleteTemplate')(function* (
    scope: FirmScope,
    templateId: string,
  ) {
    return yield* db.use(async (d) => {
      const [row] = await d
        .delete(checklistTemplate)
        .where(
          and(eq(checklistTemplate.id, templateId), eq(checklistTemplate.accountingFirmId, scope)),
        )
        .returning({ id: checklistTemplate.id });

      return row;
    });
  });

  return {
    listDocumentTypes,
    documentTypesVisible,
    listTemplates,
    findTemplate,
    listTemplateItems,
    listItemsForTemplates,
    templateItemsForCompany,
    listOverrides,
    listOverridesForCompanies,
    createTemplate,
    copyItems,
    renameTemplate,
    deriveTemplate,
    addTemplateItem,
    updateTemplateItem,
    deleteTemplateItem,
    upsertOverride,
    deleteOverride,
    companyChecklistContext,
    effectiveChecklist,
    countCompaniesUsingTemplate,
    deleteTemplate,
  };
});

export class ChecklistsRepo extends Context.Service<ChecklistsRepo, Effect.Success<typeof make>>()(
  'competa/api/checklists/ChecklistsRepo',
) {
  static readonly layerNoDeps = Layer.effect(ChecklistsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
