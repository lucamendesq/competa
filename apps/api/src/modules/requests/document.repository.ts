import { Injectable } from '@nestjs/common';
import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { v7 as uuidv7 } from 'uuid';
import type { PresignUploadBody } from '@competa/contracts';
import { Database } from '../../infra/database/database.js';
import { document, period, request, requestItem } from '../../infra/database/schema/index.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { NotFound, ValidationError } from '../../lib/app-error.js';
import type { UploadScope } from '../auth/scope.js';
import {
  MAX_FILES_PER_UPLOAD,
  buildStorageKey,
  confirmationRefusal,
  isFormatCompatible,
  rejectionReason,
  requestCapRefusal,
} from './file-rules.js';

type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export type ConfirmedDocument = {
  id: string;
  storageKey: string;
  fileName: string;
  contentType: string;
  requestItemId: string | null;
  declaredBytes: number;
};

const inspectAndHashStream = (stream: Readable): Promise<{ hash: string; firstChunk: Buffer }> => {
  return new Promise((resolve, reject) => {
    const hasher = createHash('sha256');
    const chunks: Buffer[] = [];
    let bytesRead = 0;

    stream.on('data', (chunk: Buffer) => {
      hasher.update(chunk);
      if (bytesRead < 512) {
        chunks.push(chunk);
        bytesRead += chunk.length;
      }
    });

    stream.on('end', () => {
      const firstChunk = Buffer.concat(chunks).subarray(0, 512);
      resolve({ hash: hasher.digest('hex'), firstChunk });
    });

    stream.on('error', reject);
  });
};

@Injectable()
export class DocumentRepository {
  constructor(
    private readonly db: Database,
    private readonly storage: StorageProvider,
  ) {}

  async presign(scope: UploadScope, body: PresignUploadBody) {
    if (body.files.length > MAX_FILES_PER_UPLOAD) {
      throw new ValidationError(
        `Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez (recebidos ${body.files.length}).`,
      );
    }

    return this.db.transaction(async (tx) => {
      const [lockedRequest] = await tx
        .select({ id: request.id, status: request.status })
        .from(request)
        .where(eq(request.id, scope.requestId))
        .for('update')
        .limit(1);

      if (!lockedRequest) throw new NotFound('Solicitação não encontrada.');

      const context = await this.uploadContextTx(tx, scope, body.requestItemId);
      if (!context) throw new NotFound('Solicitação não encontrada.');

      if (body.requestItemId) {
        if (!context.item) throw new NotFound('Item não encontrado nesta solicitação.');
        if (context.status === 'closed') {
          throw new ValidationError(
            'Esta solicitação foi encerrada: os itens não aceitam mais envios. Envie como Documento Extra.',
          );
        }
      }

      const usage = await this.usageForRequestTx(tx, scope.requestId);
      const created: {
        id: string;
        requestItemId: string | null;
        storageKey: string;
        fileName: string;
        contentType: string;
        sizeBytes: number;
      }[] = [];
      const files: {
        fileName: string;
        accepted: boolean;
        reason?: string;
        documentId?: string;
        uploadUrl?: string;
      }[] = [];

      for (const file of body.files) {
        const reason =
          rejectionReason(file, context.item?.acceptedFormats ?? null) ??
          requestCapRefusal(usage, file);
        if (reason) {
          files.push({ fileName: file.fileName, accepted: false, reason });
          continue;
        }

        usage.count += 1;
        usage.bytes += file.sizeBytes;

        const documentId = uuidv7();
        const storageKey = buildStorageKey({
          accountingFirmId: context.accountingFirmId,
          referenceMonth: context.referenceMonth,
          requestId: scope.requestId,
          documentId,
          file,
        });

        created.push({
          id: documentId,
          requestItemId: body.requestItemId ?? null,
          storageKey,
          fileName: file.fileName,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
        });

        files.push({
          fileName: file.fileName,
          accepted: true,
          documentId,
          uploadUrl: await this.storage.presignPut({
            storageKey,
            contentType: file.contentType,
            sizeBytes: file.sizeBytes,
          }),
        });
      }

      if (created.length) {
        await tx.insert(document).values(
          created.map((row) => ({
            ...row,
            requestId: scope.requestId,
            uploadedByContactId: scope.contactId,
          })),
        );
      }

      return { files };
    });
  }

  async confirm(scope: UploadScope, documentIds: string[]) {
    const pending = await this.pendingUpload(scope, documentIds);
    if (!pending.length) throw new NotFound('Nenhum documento deste envio foi encontrado.');

    const accepted: { id: string; realBytes: number; checksum: string; storageKey: string }[] = [];
    const refused: { documentId: string; fileName: string; reason: string; storageKey: string }[] = [];

    for (const row of pending) {
      const realBytes = await this.storage.statSize(row.storageKey);
      const sizeReason = confirmationRefusal({
        fileName: row.fileName,
        declaredBytes: row.declaredBytes,
        realBytes,
      });

      if (sizeReason) {
        refused.push({
          documentId: row.id,
          fileName: row.fileName,
          reason: sizeReason,
          storageKey: row.storageKey,
        });
        continue;
      }

      let hash: string;
      let firstChunk: Buffer;
      try {
        const stream = await this.storage.openRead(row.storageKey);
        const inspected = await inspectAndHashStream(stream);
        hash = inspected.hash;
        firstChunk = inspected.firstChunk;
      } catch {
        refused.push({
          documentId: row.id,
          fileName: row.fileName,
          reason: 'Falha ao ler o arquivo no storage.',
          storageKey: row.storageKey,
        });
        continue;
      }

      const detected = await fileTypeFromBuffer(firstChunk);
      if (!isFormatCompatible(detected?.ext, row.fileName, firstChunk)) {
        refused.push({
          documentId: row.id,
          fileName: row.fileName,
          reason: 'O conteúdo do arquivo não corresponde ao formato declarado.',
          storageKey: row.storageKey,
        });
        continue;
      }

      accepted.push({
        id: row.id,
        realBytes: realBytes!,
        checksum: hash,
        storageKey: row.storageKey,
      });
    }

    if (refused.length) {
      await this.discard(refused.map((row) => row.documentId));
      await Promise.all(
        refused.map((row) => this.storage.remove(row.storageKey).catch(() => undefined)),
      );
    }

    try {
      const { confirmed, submittedItemIds } = await this.db.transaction(async (tx) => {
        const rows = await tx
          .select({ id: document.id, requestItemId: document.requestItemId })
          .from(document)
          .where(
            and(
              eq(document.requestId, scope.requestId),
              inArray(
                document.id,
                accepted.map((row) => row.id),
              ),
            ),
          );

        for (const row of accepted) {
          await tx
            .update(document)
            .set({
              uploadStatus: 'uploaded',
              uploadedAt: new Date(),
              sizeBytes: row.realBytes,
              checksum: row.checksum,
            })
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

      return {
        confirmed: confirmed.length,
        submittedItemIds,
        refused: refused.map(({ documentId, fileName, reason }) => ({
          documentId,
          fileName,
          reason,
        })),
      };
    } catch (error) {
      await Promise.all(
        accepted.map((row) => this.storage.remove(row.storageKey).catch(() => undefined)),
      );
      throw error;
    }
  }

  async uploadContext(scope: UploadScope, requestItemId?: string | null) {
    return this.uploadContextTx(this.db, scope, requestItemId);
  }

  private async uploadContextTx(
    executor: Database | Tx,
    scope: UploadScope,
    requestItemId?: string | null,
  ) {
    const [context] = await executor
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

    const [item] = await executor
      .select({ id: requestItem.id, acceptedFormats: requestItem.acceptedFormats })
      .from(requestItem)
      .where(and(eq(requestItem.id, requestItemId), eq(requestItem.requestId, scope.requestId)))
      .limit(1);

    return { ...context, item };
  }

  async usageForRequest(requestId: string) {
    return this.usageForRequestTx(this.db, requestId);
  }

  private async usageForRequestTx(executor: Database | Tx, requestId: string) {
    const [row] = await executor
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${document.sizeBytes}), 0)::bigint`,
      })
      .from(document)
      .where(eq(document.requestId, requestId));

    return { count: row?.count ?? 0, bytes: Number(row?.bytes ?? 0) };
  }

  async createMany(
    scope: UploadScope,
    documents: {
      id: string;
      requestItemId: string | null;
      storageKey: string;
      fileName: string;
      contentType: string;
      sizeBytes: number;
    }[],
  ) {
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

  async staleAwaitingUpload(olderThan: Date) {
    return this.db
      .select({ id: document.id, storageKey: document.storageKey })
      .from(document)
      .where(and(eq(document.uploadStatus, 'awaiting_upload'), lt(document.createdAt, olderThan)));
  }

  async expiredFiscalDocuments(olderThan: Date, limit = 1000) {
    return this.db
      .select({ id: document.id, storageKey: document.storageKey })
      .from(document)
      .where(lt(document.createdAt, olderThan))
      .limit(limit);
  }

  async purgeFiscalDocuments(documentIds: string[]) {
    if (!documentIds.length) return;
    await this.db.delete(document).where(inArray(document.id, documentIds));
  }
}
