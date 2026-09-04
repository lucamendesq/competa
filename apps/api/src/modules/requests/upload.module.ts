import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { DocumentRepository } from './document.repository.js';
import { UploadController } from './upload.controller.js';
import { UploadLinkRepository } from './upload-link.repository.js';

/** Fase 4 — fluxo público de upload (UploadTokenGuard, fora do Better Auth).
 *  Módulo próprio, e não dentro do RequestsModule, porque a fronteira de
 *  autenticação é outra — e para os dois agentes da Fase 3/4 não colidirem. */
@Module({
  imports: [StorageModule],
  controllers: [UploadController],
  providers: [UploadTokenGuard, UploadLinkRepository, DocumentRepository],
})
export class UploadModule {}
