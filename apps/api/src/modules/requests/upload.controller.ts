import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ConfirmUploadBody, PresignUploadBody } from '@contabilidade/contracts';
import { v7 as uuidv7 } from 'uuid';
import {
  MAX_FILES_PER_UPLOAD,
  buildStorageKey,
  rejectionReason,
} from './file-rules.js';
import { StorageProvider } from '../../infra/storage/storage.provider.js';
import { NotFound, ValidationError } from '../../lib/app-error.js';
import { zodPipe } from '../../lib/zod-pipe.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { CurrentUploadScope } from '../auth/upload-scope.decorator.js';
import type { UploadScope } from '../auth/scope.js';
import { DocumentRepository } from './document.repository.js';
import { UploadLinkRepository } from './upload-link.repository.js';

/** Rotas públicas do Link de Upload: só-escrita. Exibem nome/status/prazo dos Itens,
 *  nunca listam nem devolvem conteúdo de `document`. `@AllowAnonymous()` porque o
 *  TenantGuard é global e este fluxo não passa pelo Better Auth. */
@Controller('upload/:token')
@AllowAnonymous()
@UseGuards(UploadTokenGuard)
export class UploadController {
  constructor(
    private readonly links: UploadLinkRepository,
    private readonly documents: DocumentRepository,
    private readonly storage: StorageProvider,
  ) {}

  @Get()
  async checklist(@CurrentUploadScope() scope: UploadScope) {
    const checklist = await this.links.findChecklist(scope);
    if (!checklist) throw new NotFound('Solicitação não encontrada.');

    return {
      company: checklist.companyName,
      referenceMonth: checklist.referenceMonth,
      dueDate: checklist.periodDueDate,
      status: checklist.status,
      items: checklist.items.map((item) => ({
        ...item,
        dueDate: item.dueDate ?? checklist.periodDueDate,
      })),
    };
  }

  @Post('documents')
  async presign(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(PresignUploadBody)) body: PresignUploadBody,
  ) {
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

    for (const file of body.files) {
      const reason = rejectionReason(file, context.item?.acceptedFormats ?? null);
      if (reason) {
        files.push({ fileName: file.fileName, accepted: false, reason });
        continue;
      }

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
        storageKey,
        uploadUrl: await this.storage.presignPut({ storageKey, contentType: file.contentType }),
      });
    }

    if (created.length) await this.documents.createMany(scope, created);

    return { files };
  }

  @Post('documents/confirm')
  async confirm(
    @CurrentUploadScope() scope: UploadScope,
    @Body(zodPipe(ConfirmUploadBody)) body: ConfirmUploadBody,
  ) {
    const { confirmed, submittedItemIds } = await this.documents.confirm(scope, body.documentIds);
    if (!confirmed.length) throw new NotFound('Nenhum documento deste envio foi encontrado.');

    return { confirmed: confirmed.length, submittedItemIds };
  }
}
