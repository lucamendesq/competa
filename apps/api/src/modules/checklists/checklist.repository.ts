import { Injectable } from '@nestjs/common';
import { and, count, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type {
  CreateOverrideBody,
  CreateTemplateItemBody,
  UpdateTemplateItemBody,
} from '@contabilidade/contracts';
import { Database } from '../../infra/database/database.js';
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

@Injectable()
export class ChecklistRepository {
  constructor(private readonly db: Database) {}

  async listDocumentTypes(
    scope: FirmScope,
    query: { category?: string; page: number; perPage: number },
  ) {
    const where = and(
      visibleTo(scope, documentType.accountingFirmId),
      query.category ? eq(documentType.category, query.category) : undefined,
    );

    const [rows, [total]] = await Promise.all([
      this.db
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
      this.db.select({ value: count() }).from(documentType).where(where),
    ]);

    return { rows, total: total.value };
  }

  async documentTypesVisible(scope: FirmScope, ids: string[]) {
    const rows = await this.db
      .select({ id: documentType.id })
      .from(documentType)
      .where(and(inArray(documentType.id, ids), visibleTo(scope, documentType.accountingFirmId)));

    return rows.map((row) => row.id);
  }

  async listTemplates(scope: FirmScope) {
    return this.db
      .select({
        id: checklistTemplate.id,
        name: checklistTemplate.name,
        derivedFrom: checklistTemplate.derivedFrom,
        isProduct: isNull(checklistTemplate.accountingFirmId),
        itemCount: this.db.$count(
          checklistTemplateItem,
          eq(checklistTemplateItem.checklistTemplateId, checklistTemplate.id),
        ),
        companyCount: this.db.$count(
          company,
          and(
            eq(company.checklistTemplateId, checklistTemplate.id),
            eq(company.accountingFirmId, scope),
            eq(company.active, true),
          ),
        ),
      })
      .from(checklistTemplate)
      .where(visibleTo(scope, checklistTemplate.accountingFirmId))
      .orderBy(checklistTemplate.name);
  }

  async findTemplate(scope: FirmScope, templateId: string) {
    const [row] = await this.db
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
  }

  async listTemplateItems(templateId: string) {
    return this.db
      .select(itemColumns)
      .from(checklistTemplateItem)
      .innerJoin(documentType, eq(documentType.id, checklistTemplateItem.documentTypeId))
      .where(eq(checklistTemplateItem.checklistTemplateId, templateId))
      .orderBy(documentType.category, documentType.name);
  }

  async templateItemsForCompany(scope: FirmScope, companyId: string) {
    return this.db
      .select(itemColumns)
      .from(company)
      .leftJoin(checklistTemplate, eq(checklistTemplate.id, company.checklistTemplateId))
      .leftJoin(
        checklistTemplateItem,
        eq(checklistTemplateItem.checklistTemplateId, checklistTemplate.id),
      )
      .innerJoin(documentType, eq(documentType.id, checklistTemplateItem.documentTypeId))
      .where(and(eq(company.id, companyId), eq(company.accountingFirmId, scope)))
      .orderBy(documentType.category, documentType.name);
  }

  async listOverrides(scope: FirmScope, companyId: string) {
    return this.db
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
  }

  async createTemplate(
    scope: FirmScope,
    input: { name: string; derivedFrom: string },
    tx: Database = this.db,
  ) {
    const [row] = await tx
      .insert(checklistTemplate)
      .values({ ...input, accountingFirmId: scope })
      .returning();

    return row;
  }

  async copyItems(fromTemplateId: string, toTemplateId: string, tx: Database = this.db) {
    const source = await tx
      .select()
      .from(checklistTemplateItem)
      .where(eq(checklistTemplateItem.checklistTemplateId, fromTemplateId));

    if (source.length === 0) return 0;

    await tx.insert(checklistTemplateItem).values(
      source.map((item) => ({
        checklistTemplateId: toTemplateId,
        documentTypeId: item.documentTypeId,
        periodicity: item.periodicity,
        annualMonth: item.annualMonth,
        dueDay: item.dueDay,
        dueMonthOffset: item.dueMonthOffset,
        conditionFlag: item.conditionFlag,
        required: item.required,
      })),
    );

    return source.length;
  }

  /** Só o modelo da própria Contabilidade (o controller garante com `requireOwned`): o do
   *  produto é compartilhado por todos os tenants. */
  async renameTemplate(templateId: string, name: string) {
    const [row] = await this.db
      .update(checklistTemplate)
      .set({ name })
      .where(eq(checklistTemplate.id, templateId))
      .returning({
        id: checklistTemplate.id,
        name: checklistTemplate.name,
        derivedFrom: checklistTemplate.derivedFrom,
        accountingFirmId: checklistTemplate.accountingFirmId,
      });

    return row;
  }

  async deriveTemplate(scope: FirmScope, source: { id: string; name: string }, name?: string) {
    return this.db.transaction(async (tx) => {
      const derived = await this.createTemplate(
        scope,
        { name: name ?? source.name, derivedFrom: source.id },
        tx,
      );

      const itemCount = await this.copyItems(source.id, derived.id, tx);

      return { ...derived, itemCount };
    });
  }

  async addTemplateItem(templateId: string, body: CreateTemplateItemBody) {
    const [row] = await this.db
      .insert(checklistTemplateItem)
      .values({ ...body, checklistTemplateId: templateId })
      // unique(checklist_template_id, document_type_id): repetir o Tipo de Documento é
      // conflito de negócio (409), não erro de servidor — quem decide é o controller.
      .onConflictDoNothing()
      .returning();

    return row;
  }

  async updateTemplateItem(templateId: string, itemId: string, body: UpdateTemplateItemBody) {
    if (body.annualMonth === null && body.periodicity === undefined) {
      const [existing] = await this.db
        .select({ periodicity: checklistTemplateItem.periodicity })
        .from(checklistTemplateItem)
        .where(
          and(
            eq(checklistTemplateItem.id, itemId),
            eq(checklistTemplateItem.checklistTemplateId, templateId),
          ),
        );
      if (existing?.periodicity === 'annual') {
        throw new ValidationError('Item anual exige annualMonth.');
      }
    }

    const [row] = await this.db
      .update(checklistTemplateItem)
      .set(body)
      .where(
        and(
          eq(checklistTemplateItem.id, itemId),
          eq(checklistTemplateItem.checklistTemplateId, templateId),
        ),
      )
      .returning();

    return row;
  }

  async deleteTemplateItem(templateId: string, itemId: string) {
    const [row] = await this.db
      .delete(checklistTemplateItem)
      .where(
        and(
          eq(checklistTemplateItem.id, itemId),
          eq(checklistTemplateItem.checklistTemplateId, templateId),
        ),
      )
      .returning({ id: checklistTemplateItem.id });

    return row;
  }

  async upsertOverride(companyId: string, body: CreateOverrideBody) {
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

    const [row] = await this.db
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
  }

  async deleteOverride(companyId: string, documentTypeId: string) {
    const [row] = await this.db
      .delete(companyChecklistOverride)
      .where(
        and(
          eq(companyChecklistOverride.companyId, companyId),
          eq(companyChecklistOverride.documentTypeId, documentTypeId),
        ),
      )
      .returning({ id: companyChecklistOverride.id });

    return row;
  }

  async companyChecklistContext(scope: FirmScope, companyId: string) {
    const [row] = await this.db
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
  }

  async effectiveChecklist(scope: FirmScope, companyId: string) {
    const context = await this.companyChecklistContext(scope, companyId);
    if (!context) return undefined;

    const [templateItems, overrides] = await Promise.all([
      context.checklistTemplateId
        ? this.templateItemsForCompany(scope, companyId)
        : Promise.resolve([]),
      this.listOverrides(scope, companyId),
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
  }

  async countCompaniesUsingTemplate(scope: FirmScope, templateId: string) {
    const [row] = await this.db
      .select({ count: count(company.id) })
      .from(company)
      .where(and(eq(company.checklistTemplateId, templateId), eq(company.accountingFirmId, scope)));

    return Number(row?.count ?? 0);
  }

  async deleteTemplate(scope: FirmScope, templateId: string) {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(checklistTemplateItem)
        .where(eq(checklistTemplateItem.checklistTemplateId, templateId));

      const [row] = await tx
        .delete(checklistTemplate)
        .where(
          and(
            eq(checklistTemplate.id, templateId),
            eq(checklistTemplate.accountingFirmId, scope),
          ),
        )
        .returning({ id: checklistTemplate.id });

      return row;
    });
  }
}
