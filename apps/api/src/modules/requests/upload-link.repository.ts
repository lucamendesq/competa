import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, or } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import {
  accountingFirm,
  company,
  contact,
  document,
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
    const now = new Date();
    const [row] = await this.db
      .select({
        requestId: uploadLink.requestId,
        contactId: uploadLink.contactId,
        expiresAt: uploadLink.expiresAt,
        previousExpiresAt: uploadLink.previousExpiresAt,
        tokenHash: uploadLink.tokenHash,
        previousTokenHash: uploadLink.previousTokenHash,
        revoked: uploadLink.revoked,
      })
      .from(uploadLink)
      .innerJoin(request, eq(request.id, uploadLink.requestId))
      .innerJoin(company, eq(company.id, request.companyId))
      .where(
        and(
          eq(company.active, true),
          or(
            eq(uploadLink.tokenHash, tokenHash),
            and(eq(uploadLink.previousTokenHash, tokenHash), gt(uploadLink.previousExpiresAt, now)),
          ),
        ),
      )
      .limit(1);

    if (!row) return undefined;

    const isCurrent = row.tokenHash === tokenHash;
    const effectiveExpiresAt = isCurrent ? row.expiresAt : row.previousExpiresAt!;

    return {
      requestId: row.requestId,
      contactId: row.contactId,
      expiresAt: effectiveExpiresAt,
      revoked: row.revoked,
    };
  }

  /** O que a página pública mostra. O Link é só-escrita: nem conteúdo, nem `storage_key`,
   *  nem NOME de arquivo — nome de arquivo contábil costuma carregar CNPJ, razão social de
   *  terceiros e valores, e quem tem o link não é necessariamente quem enviou. Sobra o que
   *  o Responsável precisa para saber o que falta: ordem do envio, status e motivo da
   *  recusa. */
  async findChecklist(scope: UploadScope) {
    const [row] = await this.db
      .select({
        companyName: company.name,
        accountingFirmName: accountingFirm.name,
        referenceMonth: period.referenceMonth,
        periodDueDate: period.dueDate,
        status: request.status,
      })
      .from(request)
      .innerJoin(company, eq(company.id, request.companyId))
      .innerJoin(accountingFirm, eq(accountingFirm.id, company.accountingFirmId))
      .innerJoin(period, eq(period.id, request.periodId))
      .where(eq(request.id, scope.requestId))
      .limit(1);

    if (!row) return undefined;

    const [items, documents] = await Promise.all([
      this.db
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
        .orderBy(asc(requestItem.name)),
      this.db
        .select({
          requestItemId: document.requestItemId,
          reviewStatus: document.reviewStatus,
          rejectionReason: document.rejectionReason,
        })
        .from(document)
        .where(and(eq(document.requestId, scope.requestId), eq(document.uploadStatus, 'uploaded')))
        .orderBy(asc(document.uploadedAt)),
    ]);

    return {
      ...row,
      items: items.map((item) => ({
        ...item,
        documents: documents.filter((file) => file.requestItemId === item.id),
      })),
      extraDocuments: documents.filter((file) => !file.requestItemId),
    };
  }

  async findContact(scope: UploadScope) {
    const [row] = await this.db
      .select({
        id: contact.id,
        name: contact.name,
        email: contact.email,
        authUserId: contact.authUserId,
      })
      .from(contact)
      .where(eq(contact.id, scope.contactId))
      .limit(1);

    return row;
  }
}
