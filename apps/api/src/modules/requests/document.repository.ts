import { Injectable } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
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

export type ConfirmedDocument = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  requestItemId: string | null;
  declaredBytes: number;
};

@Injectable()
export class DocumentRepository {
  constructor(private readonly db: Database) {}

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

  /** Quanto a Solicitação já acumulou — para o teto de documentos/bytes (AVAIL-2).
   *  `awaiting_upload` conta: a linha reserva a cota até o presign expirar e ser varrido. */
  async usageForRequest(requestId: string) {
    const [row] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${document.sizeBytes}), 0)::bigint`,
      })
      .from(document)
      .where(eq(document.requestId, requestId));

    return { count: row?.count ?? 0, bytes: Number(row?.bytes ?? 0) };
  }

  /** Linha nasce `awaiting_upload`: até a confirmação o arquivo não existe no storage e
   *  não pode contar como enviado (nem para revisão, nem para zip, nem para o painel). */
  async createMany(scope: UploadScope, documents: NewDocument[]) {
    await this.db.insert(document).values(
      documents.map((row) => ({
        ...row,
        requestId: scope.requestId,
        uploadedByContactId: scope.contactId,
      })),
    );
  }

  async pendingUpload(scope: UploadScope, documentIds: string[]): Promise<ConfirmedDocument[]> {
    return this.db
      .select({
        id: document.id,
        storageKey: document.storageKey,
        fileName: document.fileName,
        contentType: document.contentType,
        requestItemId: document.requestItemId,
        declaredBytes: document.sizeBytes,
      })
      .from(document)
      .where(
        and(
          eq(document.requestId, scope.requestId),
          inArray(document.id, documentIds),
          eq(document.uploadStatus, 'awaiting_upload'),
        ),
      );
  }

  async discard(documentIds: string[]) {
    if (!documentIds.length) return;

    await this.db.delete(document).where(inArray(document.id, documentIds));
  }

  async confirm(scope: UploadScope, confirmed: { id: string; realBytes: number }[]) {
    if (!confirmed.length) return { confirmed: [], submittedItemIds: [] };

    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: document.id, requestItemId: document.requestItemId })
        .from(document)
        .where(
          and(
            eq(document.requestId, scope.requestId),
            inArray(
              document.id,
              confirmed.map((row) => row.id),
            ),
          ),
        );

      for (const row of confirmed) {
        await tx
          .update(document)
          .set({ uploadStatus: 'uploaded', uploadedAt: new Date(), sizeBytes: row.realBytes })
          .where(eq(document.id, row.id));
      }

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

  /** Documentos que pediram URL e nunca confirmaram (PUT falhou, aba fechada, cliente
   *  desistiu). Ficam invisíveis na leitura por causa do `upload_status`, mas sem faxina
   *  acumulam linha e objeto no storage para sempre. */
  async staleAwaitingUpload(olderThan: Date) {
    return this.db
      .select({ id: document.id, storageKey: document.storageKey })
      .from(document)
      .where(and(eq(document.uploadStatus, 'awaiting_upload'), lt(document.createdAt, olderThan)));
  }
}
