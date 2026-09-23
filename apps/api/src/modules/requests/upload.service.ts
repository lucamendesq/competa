import { Injectable, Logger } from '@nestjs/common';
import type { PresignUploadBody } from '@competa/contracts';
import { v7 as uuidv7 } from 'uuid';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { NotFound, ValidationError } from '../../lib/app-error.js';
import type { UploadScope } from '../auth/scope.js';
import { DocumentRepository } from './document.repository.js';
import {
  MAX_FILES_PER_UPLOAD,
  buildStorageKey,
  confirmationRefusal,
  fileExtension,
  rejectionReason,
  requestCapRefusal,
  validateMagicBytes,
} from './file-rules.js';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private readonly documents: DocumentRepository,
    private readonly storage: StorageProvider,
  ) {}

  async presign(scope: UploadScope, body: PresignUploadBody) {
    if (body.files.length > MAX_FILES_PER_UPLOAD) {
      throw new ValidationError(
        `Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos por vez (recebidos ${body.files.length}).`,
      );
    }

    const context = await this.documents.uploadContext(scope, body.requestItemId);
    if (!context) throw new NotFound('Solicitação não encontrada.');

    if (body.requestItemId) {
      if (!context.item) throw new NotFound('Item não encontrado nesta solicitação.');
      if (context.status === 'closed') {
        throw new ValidationError(
          'Esta solicitação foi encerrada: os itens não aceitam mais envios. Envie como Documento Extra.',
        );
      }
    }

    const created: Parameters<DocumentRepository['createMany']>[1] = [];
    const files = [];
    // o teto é conferido contra o acumulado + o que este presign vai reservar
    const usage = await this.documents.usageForRequest(scope.requestId);

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

    if (created.length) await this.documents.createMany(scope, created);

    return { files };
  }

  async confirm(scope: UploadScope, documentIds: string[]) {
    const pending = await this.documents.pendingUpload(scope, documentIds);
    if (!pending.length) throw new NotFound('Nenhum documento deste envio foi encontrado.');

    const accepted: { id: string; realBytes: number }[] = [];
    const refused: { documentId: string; fileName: string; reason: string }[] = [];

    for (const row of pending) {
      const realBytes = await this.storage.statSize(row.storageKey);
      let reason = confirmationRefusal({
        fileName: row.fileName,
        declaredBytes: row.declaredBytes,
        realBytes,
      });

      if (!reason && realBytes && realBytes > 0) {
        const ext = fileExtension({ fileName: row.fileName, contentType: row.contentType });
        if (ext) {
          const head = await this.storage.readHead(row.storageKey, 512);
          reason = validateMagicBytes(head, ext);
        }
      }

      if (reason) {
        refused.push({ documentId: row.id, fileName: row.fileName, reason });
        continue;
      }

      accepted.push({ id: row.id, realBytes: realBytes! });
    }

    if (refused.length) {
      await this.documents.discard(refused.map((row) => row.documentId));
      await Promise.all(
        pending
          .filter((row) => refused.some((bad) => bad.documentId === row.id))
          .map((row) =>
            this.storage.remove(row.storageKey).catch((error) => {
              this.logger.warn(
                `Falha ao remover arquivo recusado ${row.storageKey} do storage: ${String(error)}`,
              );
            }),
          ),
      );
    }

    const { confirmed, submittedItemIds } = await this.documents.confirm(scope, accepted);

    return { confirmed: confirmed.length, submittedItemIds, refused };
  }
}
