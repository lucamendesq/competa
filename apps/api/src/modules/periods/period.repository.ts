import { Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { OpenPeriodBody } from '@competa/contracts';
import { addDays } from 'date-fns';
import env from '../../config/env.js';
import { createToken } from '../../lib/token.js';
import { Database } from '../../infra/database/database.js';
import {
  company,
  contact,
  document,
  period,
  request,
  requestItem,
  uploadLink,
} from '../../infra/database/schema/index.js';
import { companyIdsOf, type ContactScope, type FirmScope } from '../auth/scope.js';
import { ChecklistRepository } from '../checklists/checklist.repository.js';
import { summarizePending, type PanelRow } from '../requests/review-rules.js';
import { PeriodAlreadyClosed, PeriodAlreadyOpen } from './errors.js';
import { planFanOut, type RequestPlan } from './fan-out.js';

/** O driver embrulha o erro do Postgres; procuramos a constraint na cadeia de causas
 *  para devolver 409 de negócio em vez de 500. */
const violatesPeriodUnique = (error: unknown): boolean => {
  for (let cause: unknown = error; cause instanceof Error; cause = cause.cause) {
    const pg = cause as { constraint?: string; code?: string };
    if (pg.constraint === 'period_firm_month_uidx') return true;
    if (pg.code === '23505' && cause.message.includes('period_firm_month_uidx')) return true;
  }

  return false;
};

@Injectable()
export class PeriodRepository {
  constructor(
    private readonly db: Database,
    private readonly checklists: ChecklistRepository,
  ) {}

  async openPeriod(scope: FirmScope, body: OpenPeriodBody) {
    const companies = await this.activeCompanies(scope);

    // ponytail: um effectiveChecklist por Empresa (3 queries cada) — carteira de escritório
    // pequeno; virar consulta única só quando a carteira doer.
    const checklists = new Map(
      await Promise.all(
        companies
          .filter((row) => row.checklistTemplateId && row.contact?.email)
          .map(
            async (row) =>
              [
                row.id,
                (await this.checklists.effectiveChecklist(scope, row.id))?.items ?? [],
              ] as const,
          ),
      ),
    );

    const { plans, warnings } = planFanOut({
      companies,
      checklistFor: (companyId) => checklists.get(companyId) ?? [],
      referenceMonth: body.referenceMonth,
      expiresAt: addDays(new Date(), env.UPLOAD_LINK_TTL_DAYS),
      createToken,
    });

    const { period: row, requestIdByCompany } = await this.openWithFanOut(scope, body, plans);

    // ponytail: evento RequestCreated entra na Fase 5 (messaging), quando houver quem escute

    return { period: row, warnings, plans, requestIdByCompany };
  }

  async activeCompanies(scope: FirmScope) {
    const companies = await this.db
      .select({
        id: company.id,
        name: company.name,
        checklistTemplateId: company.checklistTemplateId,
      })
      .from(company)
      .where(and(eq(company.accountingFirmId, scope), eq(company.active, true)))
      .orderBy(company.name);

    if (companies.length === 0) return [];

    const contacts = await this.db
      .select({
        id: contact.id,
        companyId: contact.companyId,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
      })
      .from(contact)
      .where(
        inArray(
          contact.companyId,
          companies.map((row) => row.id),
        ),
      )
      .orderBy(contact.createdAt);

    return companies.map((row) => ({
      ...row,
      contact: contacts.find((c) => c.companyId === row.id),
    }));
  }

  async openWithFanOut(
    scope: FirmScope,
    input: { referenceMonth: string; dueDate?: string },
    plans: RequestPlan[],
  ) {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(period)
          .values({
            accountingFirmId: scope,
            referenceMonth: input.referenceMonth,
            dueDate: input.dueDate ?? null,
          })
          .returning();

        if (plans.length === 0)
          return { period: row, requestIdByCompany: new Map<string, string>() };

        const requests = await tx
          .insert(request)
          .values(plans.map((plan) => ({ periodId: row.id, companyId: plan.companyId })))
          .returning({ id: request.id, companyId: request.companyId });

        const requestIdByCompany = new Map(requests.map((r) => [r.companyId, r.id]));

        const items = plans.flatMap((plan) =>
          plan.items.map((item) => ({
            ...item,
            requestId: requestIdByCompany.get(plan.companyId)!,
          })),
        );
        if (items.length > 0) await tx.insert(requestItem).values(items);

        await tx.insert(uploadLink).values(
          plans.map((plan) => ({
            requestId: requestIdByCompany.get(plan.companyId)!,
            contactId: plan.contactId,
            tokenHash: plan.tokenHash,
            expiresAt: plan.expiresAt,
          })),
        );

        return { period: row, requestIdByCompany };
      });
    } catch (error) {
      if (violatesPeriodUnique(error)) throw new PeriodAlreadyOpen(input.referenceMonth);
      throw error;
    }
  }

  async list(scope: FirmScope, query: { page: number; perPage: number }) {
    const where = eq(period.accountingFirmId, scope);

    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          id: period.id,
          referenceMonth: period.referenceMonth,
          status: period.status,
          dueDate: period.dueDate,
          createdAt: period.createdAt,
          requestCount: this.db.$count(request, eq(request.periodId, period.id)),
        })
        .from(period)
        .where(where)
        .orderBy(period.referenceMonth)
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      this.db.select({ value: count() }).from(period).where(where),
    ]);

    return { rows, total: total.value };
  }

  async findOwnedId(scope: FirmScope, periodId: string) {
    const [row] = await this.db
      .select({ id: period.id })
      .from(period)
      .where(and(eq(period.id, periodId), eq(period.accountingFirmId, scope)))
      .limit(1);

    return row?.id;
  }

  async findById(scope: FirmScope, periodId: string) {
    const [row] = await this.db
      .select({
        id: period.id,
        referenceMonth: period.referenceMonth,
        status: period.status,
        dueDate: period.dueDate,
        requestCount: this.db.$count(request, eq(request.periodId, period.id)),
        completeRequestCount: this.db.$count(
          request,
          and(eq(request.periodId, period.id), eq(request.status, 'complete')),
        ),
      })
      .from(period)
      .where(and(eq(period.id, periodId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    const [pending] = await this.db
      .select({ value: count() })
      .from(requestItem)
      .innerJoin(request, eq(request.id, requestItem.requestId))
      .where(and(eq(request.periodId, periodId), ne(requestItem.status, 'accepted')));

    return { ...row, pendingItemCount: pending.value };
  }

  async pendingPanel(scope: FirmScope, periodId: string) {
    const rows = await this.db
      .select({
        companyId: company.id,
        companyName: company.name,
        requestId: request.id,
        requestStatus: request.status,
        itemId: requestItem.id,
        itemName: requestItem.name,
        itemStatus: requestItem.status,
        itemDueDate: requestItem.dueDate,
        periodDueDate: period.dueDate,
        // `exists` em vez de join: um Item com dois arquivos rejeitados duplicaria a linha
        // e contaria a Empresa duas vezes no painel.
        hasRejection: sql<boolean>`exists (
          select 1 from ${document}
          where ${document.requestItemId} = ${requestItem.id}
            and ${document.reviewStatus} = 'rejected'
            and ${document.uploadStatus} = 'uploaded'
        )`,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .leftJoin(requestItem, eq(requestItem.requestId, request.id))
      .where(and(eq(request.periodId, periodId), eq(period.accountingFirmId, scope)))
      .orderBy(asc(company.name), asc(requestItem.dueDate), asc(requestItem.name));

    return summarizePending(rows as PanelRow[]);
  }

  async closePeriod(scope: FirmScope, periodId: string) {
    const [row] = await this.db
      .select({ id: period.id, status: period.status })
      .from(period)
      .where(and(eq(period.id, periodId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;
    if (row.status === 'closed') throw new PeriodAlreadyClosed();

    const [pending] = await this.db
      .select({ value: count() })
      .from(requestItem)
      .innerJoin(request, eq(request.id, requestItem.requestId))
      .where(and(eq(request.periodId, periodId), ne(requestItem.status, 'accepted')));

    return this.db.transaction(async (tx) => {
      const closedRequests = await tx
        .update(request)
        .set({ status: 'closed', closedAt: new Date() })
        .where(and(eq(request.periodId, periodId), ne(request.status, 'closed')))
        .returning({ id: request.id });

      const [closed] = await tx
        .update(period)
        .set({ status: 'closed' })
        .where(eq(period.id, periodId))
        .returning({ id: period.id, referenceMonth: period.referenceMonth, status: period.status });

      return {
        ...closed,
        closedRequestCount: closedRequests.length,
        pendingItemCount: pending.value,
      };
    });
  }

  async listRequests(scope: FirmScope, periodId: string) {
    return this.db
      .select({
        id: request.id,
        companyId: company.id,
        companyName: company.name,
        status: request.status,
        itemCount: this.db.$count(requestItem, eq(requestItem.requestId, request.id)),
        pendingItemCount: this.db.$count(
           requestItem,
           and(eq(requestItem.requestId, request.id), eq(requestItem.status, 'pending')),
        ),
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(and(eq(request.periodId, periodId), eq(period.accountingFirmId, scope)))
      .orderBy(company.name);
  }

  async periods(scope: ContactScope, query: { page: number; perPage: number }) {
    const where = inArray(request.companyId, companyIdsOf(scope));

    const [rows, [total]] = await Promise.all([
      this.db
        .select({
          requestId: request.id,
          requestStatus: request.status,
          periodId: period.id,
          referenceMonth: period.referenceMonth,
          periodStatus: period.status,
          dueDate: period.dueDate,
          companyId: company.id,
          companyName: company.name,
          itemCount: this.db.$count(requestItem, eq(requestItem.requestId, request.id)),
          pendingCount: this.db.$count(
            requestItem,
            and(eq(requestItem.requestId, request.id), ne(requestItem.status, 'accepted')),
          ),
          deliveredCount: this.db.$count(
            document,
            and(eq(document.requestId, request.id), eq(document.uploadStatus, 'uploaded')),
          ),
        })
        .from(request)
        .innerJoin(period, eq(period.id, request.periodId))
        .innerJoin(company, eq(company.id, request.companyId))
        .where(where)
        .orderBy(desc(period.referenceMonth), asc(company.name))
        .limit(query.perPage)
        .offset((query.page - 1) * query.perPage),
      this.db.select({ value: count() }).from(request).where(where),
    ]);

    return { rows, total: total.value };
  }

  async periodDetail(scope: ContactScope, periodId: string, companyId?: string) {
    const companyIds = companyIdsOf(scope);
    if (companyId && !companyIds.includes(companyId)) return undefined;

    const [head] = await this.db
      .select({
        requestId: request.id,
        requestStatus: request.status,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodStatus: period.status,
        dueDate: period.dueDate,
        companyId: company.id,
        companyName: company.name,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(
        and(
          companyId ? eq(request.companyId, companyId) : inArray(request.companyId, companyIds),
          eq(period.id, periodId),
        ),
      )
      .orderBy(asc(company.name))
      .limit(1);

    if (!head) return undefined;

    const [items, documents] = await Promise.all([
      this.db
        .select({
          id: requestItem.id,
          name: requestItem.name,
          description: requestItem.description,
          acceptedFormats: requestItem.acceptedFormats,
          status: requestItem.status,
          dueDate: requestItem.dueDate,
        })
        .from(requestItem)
        .where(eq(requestItem.requestId, head.requestId))
        .orderBy(asc(requestItem.name)),
      this.db
        .select({
          id: document.id,
          requestItemId: document.requestItemId,
          fileName: document.fileName,
          sizeBytes: document.sizeBytes,
          uploadedAt: document.uploadedAt,
          reviewStatus: document.reviewStatus,
          rejectionReason: document.rejectionReason,
          uploadedByName: contact.name,
        })
        .from(document)
        .leftJoin(contact, eq(contact.id, document.uploadedByContactId))
        .where(and(eq(document.requestId, head.requestId), eq(document.uploadStatus, 'uploaded')))
        .orderBy(asc(document.uploadedAt)),
    ]);

    return {
      ...head,
      items: items.map((item) => ({
        ...item,
        dueDate: item.dueDate ?? head.dueDate,
        documents: documents.filter((row) => row.requestItemId === item.id),
      })),
      extraDocuments: documents.filter((row) => !row.requestItemId),
    };
  }
}
