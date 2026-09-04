import { Injectable } from '@nestjs/common';
import { and, count, eq, inArray } from 'drizzle-orm';
import type { OpenPeriodBody } from '@contabilidade/contracts';
import { addDays } from 'date-fns';
import env from '../../config/env.js';
import { createToken } from '../../lib/token.js';
import { Database } from '../../infra/database/database.js';
import {
  company,
  contact,
  period,
  request,
  requestItem,
  uploadLink,
} from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';
import { ChecklistRepository } from '../checklists/checklist.repository.js';
import { PeriodAlreadyOpen } from './errors.js';
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

  /** Abrir a Competência: lê o checklist efetivo de cada Empresa ativa, decide o fan-out
   *  em `planFanOut` (puro) e grava tudo numa transação. O token em claro volta para o
   *  controller montar o link — só ali ele existe. */
  async openPeriod(scope: FirmScope, body: OpenPeriodBody) {
    const companies = await this.activeCompanies(scope);

    // ponytail: um effectiveChecklist por Empresa (3 queries cada) — carteira de escritório
    // pequeno; virar consulta única só quando a carteira doer.
    const checklists = new Map(
      await Promise.all(
        companies
          .filter((row) => row.contact)
          .map(
            async (row) =>
              [row.id, (await this.checklists.effectiveChecklist(scope, row.id))?.items ?? []] as const,
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

  /** Empresas ativas da Contabilidade com o Responsável mais antigo (se houver). */
  async activeCompanies(scope: FirmScope) {
    const companies = await this.db
      .select({ id: company.id, name: company.name })
      .from(company)
      .where(and(eq(company.accountingFirmId, scope), eq(company.active, true)))
      .orderBy(company.name);

    if (companies.length === 0) return [];

    const contacts = await this.db
      .select({ id: contact.id, companyId: contact.companyId, email: contact.email })
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

  /** Abertura inteira numa transação: se um Item falhar, nenhuma Solicitação sobra. */
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

        if (plans.length === 0) return { period: row, requestIdByCompany: new Map<string, string>() };

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
      .where(and(eq(request.periodId, periodId), eq(requestItem.status, 'pending')));

    return { ...row, pendingItemCount: pending.value };
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
}
