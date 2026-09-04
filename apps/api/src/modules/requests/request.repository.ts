import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { company, period, request, requestItem } from '../../infra/database/schema/index.js';
import type { FirmScope } from '../auth/scope.js';

@Injectable()
export class RequestRepository {
  constructor(private readonly db: Database) {}

  /** `request` só é alcançável pelo join até `period` da Contabilidade da sessão —
   *  Solicitação de outro tenant simplesmente não existe para esta consulta. */
  async findById(scope: FirmScope, requestId: string) {
    const [row] = await this.db
      .select({
        id: request.id,
        status: request.status,
        closedAt: request.closedAt,
        companyId: company.id,
        companyName: company.name,
        periodId: period.id,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(and(eq(request.id, requestId), eq(period.accountingFirmId, scope)))
      .limit(1);

    if (!row) return undefined;

    const items = await this.db
      .select({
        id: requestItem.id,
        name: requestItem.name,
        description: requestItem.description,
        status: requestItem.status,
        dueDate: requestItem.dueDate,
        acceptedFormats: requestItem.acceptedFormats,
      })
      .from(requestItem)
      .where(eq(requestItem.requestId, requestId))
      .orderBy(requestItem.name);

    return { ...row, items };
  }
}
