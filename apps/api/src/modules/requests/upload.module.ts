import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { DocumentRepository } from './document.repository.js';
import { UploadController } from './upload.controller.js';
import { UploadLinkRepository } from './upload-link.repository.js';
import { UploadService } from './upload.service.js';

/** Fase 4 — fluxo público de upload (UploadTokenGuard, fora do Better Auth). Módulo
 *  próprio, e não dentro do RequestsModule, porque a fronteira de autenticação é outra.
 *  Exporta o `UploadService` porque a área logada do Responsável (Fase 10) entra pelo
 *  MESMO pipeline, com outro guard produzindo o escopo. */
@Module({
  imports: [StorageModule],
  controllers: [UploadController],
  providers: [UploadTokenGuard, UploadLinkRepository, DocumentRepository, UploadService],
  exports: [UploadService, DocumentRepository, UploadLinkRepository],
})
export class UploadModule {}
