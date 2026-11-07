import { Context, Effect, Layer } from 'effect';
import { and, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { fileTypeFromBuffer } from 'file-type';
import { v7 as uuidv7 } from 'uuid';
import type { PresignUploadBody } from '@competa/contracts';
import { Db, type Executor } from '../../infra/database/effect.js';
import { document, period, request, requestItem } from '../../infra/database/schema/index.js';
import { storage } from '../../infra/storage/storage.js';
import { PRESIGN_TTL_SECONDS } from '../../infra/storage/storage.provider.js';
import { NotFound, ServiceUnavailable, ValidationError } from '../../lib/app-error.js';
import type { UploadScope } from '../auth/scope.js';
import {
  MAX_DOCS_PER_REQUEST,
  MAX_FILES_PER_UPLOAD,
  buildStorageKey,
  confirmationRefusal,
  isFormatCompatible,
  rejectionReason,
  requestCapRefusal,
} from './file-rules.js';

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

const make = Effect.gen(function* () {
  const db = yield* Db;

  const uploadContextOn = async (
    executor: Executor,
    scope: UploadScope,
    requestItemId?: string | null,
  ) => {
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
      .select({
        id: requestItem.id,
        status: requestItem.status,
        acceptedFormats: requestItem.acceptedFormats,
      })
      .from(requestItem)
      .where(and(eq(requestItem.id, requestItemId), eq(requestItem.requestId, scope.requestId)))
      .limit(1);

    return { ...context, item };
  };

  const usageForRequestOn = async (executor: Executor, requestId: string) => {
    const [row] = await executor
      .select({
        count: sql<number>`count(*)::int`,
        bytes: sql<number>`coalesce(sum(${document.sizeBytes}), 0)::bigint`,
      })
      .from(document)
      .where(and(eq(document.requestId, requestId), eq(document.uploadStatus, 'uploaded')));

    return { count: row?.count ?? 0, bytes: Number(row?.bytes ?? 0) };
  };

  const liveReservationsOn = async (executor: Executor, requestId: string) => {
    const [row] = await executor
      .select({ count: sql<number>`count(*)::int` })
      .from(document)
      .where(
        and(
          eq(document.requestId, requestId),
          eq(document.uploadStatus, 'awaiting_upload'),
          gt(document.createdAt, new Date(Date.now() - PRESIGN_TTL_SECONDS * 1000)),
        ),
      );

    return row?.count ?? 0;
  };

  const pendingUploadOn = async (
    executor: Executor,
    scope: UploadScope,
    documentIds: string[],
  ): Promise<ConfirmedDocument[]> =>
    executor
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

  const discardOn = async (executor: Executor, documentIds: string[]) => {
    if (!documentIds.length) return;

    await executor
      .delete(document)
      .where(and(inArray(document.id, documentIds), eq(document.uploadStatus, 'awaiting_upload')));
  };

  const presign = Effect.fn('DocumentsRepo.presign')(function* (
    scope: UploadScope,
    body: PresignUploadBody,
  ) {
    if (body.files.length > MAX_FILES_PER_UPLOAD) {
      return yield* Effect.fail(
        new ValidationError(
          `Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez (recebidos ${body.files.length}).`,
        ),
      );
    }

    return yield* db.withTransaction(
      Effect.gen(function* () {
        const [lockedRequest] = yield* db.use((tx) =>
          tx
            .select({ id: request.id, status: request.status })
            .from(request)
            .where(eq(request.id, scope.requestId))
            .for('update')
            .limit(1),
        );

        if (!lockedRequest) return yield* new NotFound('Solicitação não encontrada.');

        const context = yield* db.use((tx) => uploadContextOn(tx, scope, body.requestItemId));
        if (!context) return yield* new NotFound('Solicitação não encontrada.');

        if (body.requestItemId) {
          if (!context.item) return yield* new NotFound('Item não encontrado nesta solicitação.');
          if (context.status === 'closed') {
            return yield* new ValidationError(
              'Esta solicitação foi encerrada: os itens não aceitam mais envios. Envie como Documento Extra.',
            );
          }
          /* Item aceito está resolvido: o arquivo novo não aparecia na revisão (que lista só
           * os enviados) e recusá-lo reabria o item já aceito. */
          if (context.item.status === 'accepted') {
            return yield* new ValidationError(
              'Este item já foi aceito pela contabilidade. Envie como Documento Extra.',
            );
          }
        }

        /* Reserva não ocupa cota da Solicitação, mas ocupa uma URL assinada de escrita no
         * storage: sem teto próprio, o presign viraria autorização ilimitada de escrita para
         * quem tem o link. Só contam as reservas ainda utilizáveis — a URL vence em
         * PRESIGN_TTL_SECONDS e o que venceu não escreve mais nada. */
        const reserved = yield* db.use((tx) => liveReservationsOn(tx, scope.requestId));
        if (reserved + body.files.length > MAX_DOCS_PER_REQUEST) {
          return yield* new ValidationError(
            'Há envios em andamento nesta solicitação. Aguarde alguns minutos e tente de novo.',
          );
        }

        return yield* db.use(async (tx) => {
          const usage = await usageForRequestOn(tx, scope.requestId);
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
              uploadUrl: await storage.presignPut({
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
      }),
    );
  });

  const confirm = Effect.fn('DocumentsRepo.confirm')(function* (
    scope: UploadScope,
    documentIds: string[],
  ) {
    const pending = yield* db.use((d) => pendingUploadOn(d, scope, documentIds));
    if (!pending.length) return yield* new NotFound('Nenhum documento deste envio foi encontrado.');

    const outcome = yield* db.use(async (d) => {
      const accepted: {
        id: string;
        fileName: string;
        realBytes: number;
        checksum: string;
        storageKey: string;
      }[] = [];
      const refused: {
        documentId: string;
        fileName: string;
        reason: string;
        storageKey: string;
        keepReservation?: boolean;
      }[] = [];

      for (const row of pending) {
        /* Tudo daqui em diante olha a cópia selada: a URL de PUT ainda vale e o original
         * pode ser reescrito depois desta conferência. */
        const sealedKey = await storage.seal(row.storageKey);
        const storageKey = sealedKey ?? row.storageKey;
        const realBytes = sealedKey ? await storage.statSize(sealedKey) : undefined;
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
            storageKey,
            /* Arquivo que ainda não chegou fica reservado (`awaiting_upload`): apagar a
             * linha deixava o PUT atrasado criar um objeto que nenhuma varredura achava. A
             * de reservas vencidas apaga linha e objeto, e confirmar de novo ainda vale. */
            keepReservation: !sealedKey,
          });
          continue;
        }

        let hash: string;
        let firstChunk: Buffer;
        try {
          const stream = await storage.openRead(storageKey);
          const inspected = await inspectAndHashStream(stream);
          hash = inspected.hash;
          firstChunk = inspected.firstChunk;
        } catch (error) {
          if (error instanceof ServiceUnavailable) throw error;
          refused.push({
            documentId: row.id,
            fileName: row.fileName,
            reason: 'Falha ao ler o arquivo no storage.',
            storageKey,
          });
          continue;
        }

        const detected = await fileTypeFromBuffer(firstChunk);
        if (!isFormatCompatible(detected?.ext, row.fileName, firstChunk)) {
          refused.push({
            documentId: row.id,
            fileName: row.fileName,
            reason: 'O conteúdo do arquivo não corresponde ao formato declarado.',
            storageKey,
          });
          continue;
        }

        accepted.push({
          id: row.id,
          fileName: row.fileName,
          realBytes: realBytes!,
          checksum: hash,
          storageKey,
        });
      }

      const discarded = refused.filter((row) => !row.keepReservation);
      if (discarded.length) {
        await discardOn(
          d,
          discarded.map((row) => row.documentId),
        );
        await Promise.all(
          discarded.map((row) => storage.remove(row.storageKey).catch(() => undefined)),
        );
      }

      try {
        const { confirmed, submittedItemIds, overflow, lost } = await d.transaction(async (tx) => {
          /* Mesmo lock do presign: dois lotes confirmando em paralelo leriam o mesmo `usage`
           * e cada um caberia no teto — juntos, não. */
          await tx
            .select({ id: request.id })
            .from(request)
            .where(eq(request.id, scope.requestId))
            .for('update')
            .limit(1);

          /* A leitura de fora da transação não vale como posse: dois confirms do mesmo
           * documento em paralelo passariam por ela e somariam os bytes duas vezes no teto.
           * Quem chega depois do lock acha o documento já confirmado e não conta nada. */
          const stillPending = new Set(
            (
              await pendingUploadOn(
                tx,
                scope,
                pending.map((row) => row.id),
              )
            ).map((row) => row.id),
          );
          const discardedIds = new Set(discarded.map((row) => row.documentId));
          const lost = new Set(
            pending
              .map((row) => row.id)
              .filter((id) => !stillPending.has(id) && !discardedIds.has(id)),
          );
          const owned = accepted.filter((row) => stillPending.has(row.id));

          const usage = await usageForRequestOn(tx, scope.requestId);
          const within: typeof accepted = [];
          const overflow: typeof refused = [];

          for (const row of owned) {
            const reason = requestCapRefusal(usage, { sizeBytes: row.realBytes });
            if (reason) {
              overflow.push({
                documentId: row.id,
                fileName: row.fileName,
                reason,
                storageKey: row.storageKey,
              });
              continue;
            }

            usage.count += 1;
            usage.bytes += row.realBytes;
            within.push(row);
          }

          if (!within.length) return { confirmed: [], submittedItemIds: [], overflow, lost };

          const rows = await tx
            .select({ id: document.id, requestItemId: document.requestItemId })
            .from(document)
            .where(
              and(
                eq(document.requestId, scope.requestId),
                inArray(
                  document.id,
                  within.map((row) => row.id),
                ),
              ),
            );

          for (const row of within) {
            await tx
              .update(document)
              .set({
                uploadStatus: 'uploaded',
                uploadedAt: new Date(),
                sizeBytes: row.realBytes,
                checksum: row.checksum,
                storageKey: row.storageKey,
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

          return {
            confirmed: rows.map((row) => row.id),
            submittedItemIds: itemIds,
            overflow,
            lost,
          };
        });

        if (overflow.length) {
          await discardOn(
            d,
            overflow.map((row) => row.documentId),
          );
          await Promise.all(
            overflow.map((row) => storage.remove(row.storageKey).catch(() => undefined)),
          );
        }

        if (lost.size === pending.length) return null;

        return {
          confirmed: confirmed.length,
          submittedItemIds,
          refused: [...refused.filter((row) => !lost.has(row.documentId)), ...overflow].map(
            ({ documentId, fileName, reason }) => ({
              documentId,
              fileName,
              reason,
            }),
          ),
        };
      } catch (error) {
        await Promise.all(
          accepted.map((row) => storage.remove(row.storageKey).catch(() => undefined)),
        );
        throw error;
      }
    });

    if (!outcome) return yield* new NotFound('Nenhum documento deste envio foi encontrado.');

    return outcome;
  });

  const uploadContext = Effect.fn('DocumentsRepo.uploadContext')(function* (
    scope: UploadScope,
    requestItemId?: string | null,
  ) {
    return yield* db.use((d) => uploadContextOn(d, scope, requestItemId));
  });

  const createMany = Effect.fn('DocumentsRepo.createMany')(function* (
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
    yield* db.use((d) =>
      d.insert(document).values(
        documents.map((row) => ({
          ...row,
          requestId: scope.requestId,
          uploadedByContactId: scope.contactId,
        })),
      ),
    );
  });

  const pendingUpload = Effect.fn('DocumentsRepo.pendingUpload')(function* (
    scope: UploadScope,
    documentIds: string[],
  ) {
    return yield* db.use((d) => pendingUploadOn(d, scope, documentIds));
  });

  const discard = Effect.fn('DocumentsRepo.discard')(function* (documentIds: string[]) {
    if (!documentIds.length) return;

    yield* db.use((d) => discardOn(d, documentIds));
  });

  const staleAwaitingUpload = Effect.fn('DocumentsRepo.staleAwaitingUpload')(function* (
    olderThan: Date,
  ) {
    return yield* db.use((d) =>
      d
        .select({ id: document.id, storageKey: document.storageKey })
        .from(document)
        .where(
          and(eq(document.uploadStatus, 'awaiting_upload'), lt(document.createdAt, olderThan)),
        ),
    );
  });

  const expiredFiscalDocuments = Effect.fn('DocumentsRepo.expiredFiscalDocuments')(function* (
    olderThan: Date,
    limit = 1000,
  ) {
    return yield* db.use((d) =>
      d
        .select({ id: document.id, storageKey: document.storageKey })
        .from(document)
        .where(lt(document.createdAt, olderThan))
        .limit(limit),
    );
  });

  const purgeFiscalDocuments = Effect.fn('DocumentsRepo.purgeFiscalDocuments')(function* (
    documentIds: string[],
  ) {
    if (!documentIds.length) return;

    yield* db.use((d) => d.delete(document).where(inArray(document.id, documentIds)));
  });

  return {
    presign,
    confirm,
    uploadContext,
    createMany,
    pendingUpload,
    discard,
    staleAwaitingUpload,
    expiredFiscalDocuments,
    purgeFiscalDocuments,
  };
});

export class DocumentsRepo extends Context.Service<DocumentsRepo, Effect.Success<typeof make>>()(
  'competa/api/requests/DocumentsRepo',
) {
  static readonly layerNoDeps = Layer.effect(DocumentsRepo, make);
  static readonly layer = this.layerNoDeps.pipe(Layer.provide(Db.layer));
}
