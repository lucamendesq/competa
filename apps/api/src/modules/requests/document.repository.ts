import { Injectable } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { Database } from '../../infra/database/database.js';
import { document, period, request, requestItem } from '../../infra/database/schema/index.js';
import type { UploadScope } from '../auth/scope.js';

type NewDocument = {
  id: string;
  requestItemId: string | null;
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
};

@Injectable()
export class DocumentRepository {
  constructor(private readonly db: Database) {}

  /** Solicitação do escopo + (opcionalmente) o Item onde o arquivo vai entrar. */
  async uploadContext(scope: UploadScope, requestItemId?: string | null) {
    const [context] = await this.db
      .select({
        status: request.status,
        accountingFirmId: period.accountingFirmId,
        referenceMonth: period.referenceMonth,
      })
      .from(request)
      .innerJoin(period, eq(period.id, request.periodId))
      .where(eq(request.id, scope.requestId))
      .limit(1);

    if (!context) return undefined;
    if (!requestItemId) return { ...context, item: undefined };

    const [item] = await this.db
      .select({ id: requestItem.id, acceptedFormats: requestItem.acceptedFormats })
      .from(requestItem)
      .where(and(eq(requestItem.id, requestItemId), eq(requestItem.requestId, scope.requestId)))
      .limit(1);

    return { ...context, item };
  }

  async createMany(scope: UploadScope, documents: NewDocument[]) {
    await this.db
      .insert(document)
      .values(documents.map((row) => ({ ...row, requestId: scope.requestId })));
  }

  /** Confirmação do envio: os Itens dos documentos confirmados viram `submitted`. */
  async confirm(scope: UploadScope, documentIds: string[]) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: document.id, requestItemId: document.requestItemId })
        .from(document)
        .where(and(eq(document.requestId, scope.requestId), inArray(document.id, documentIds)));

      const itemIds = [
        ...new Set(rows.flatMap((row) => (row.requestItemId ? [row.requestItemId] : []))),
      ];

      if (itemIds.length) {
        await tx
          .update(requestItem)
          .set({ status: 'submitted' })
          .where(
            and(
              eq(requestItem.requestId, scope.requestId),
              inArray(requestItem.id, itemIds),
              inArray(requestItem.status, ['pending', 'rejected']),
            ),
          );
      }

      return { confirmed: rows.map((row) => row.id), submittedItemIds: itemIds };
    });
  }
}
