import { Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  company,
  period,
  request,
  requestItem,
  uploadLink,
} from '../../infra/database/schema/index.js';
import type { UploadScope } from '../auth/scope.js';

@Injectable()
export class UploadLinkRepository {
  constructor(private readonly db: Database) {}

  async findByTokenHash(tokenHash: string) {
    const [row] = await this.db
      .select({
        requestId: uploadLink.requestId,
        contactId: uploadLink.contactId,
        expiresAt: uploadLink.expiresAt,
        revoked: uploadLink.revoked,
      })
      .from(uploadLink)
      .where(eq(uploadLink.tokenHash, tokenHash))
      .limit(1);

    return row;
  }

  /** O que a página pública mostra. Documentos NUNCA entram aqui (escopo só-upload). */
  async findChecklist(scope: UploadScope) {
    const [row] = await this.db
      .select({
        companyName: company.name,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
        status: request.status,
      })
      .from(request)
      .innerJoin(company, eq(company.id, request.companyId))
      .innerJoin(period, eq(period.id, request.periodId))
      .where(eq(request.id, scope.requestId))
      .limit(1);

    if (!row) return undefined;

    const items = await this.db
      .select({
        id: requestItem.id,
        name: requestItem.name,
        description: requestItem.description,
        acceptedFormats: requestItem.acceptedFormats,
        dueDate: requestItem.dueDate,
        status: requestItem.status,
      })
      .from(requestItem)
      .where(eq(requestItem.requestId, scope.requestId))
      .orderBy(asc(requestItem.name));

    return { ...row, items };
  }
}
