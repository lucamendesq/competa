import { Module } from '@nestjs/common';
import { StorageModule } from '../../infra/storage/storage.module.js';
import { UploadTokenGuard } from '../auth/upload-token.guard.js';
import { DocumentRepository } from './document.repository.js';
import { UploadController } from './upload.controller.js';
import { UploadLinkRepository } from './upload-link.repository.js';
import { UploadService } from './upload.service.js';

@Module({
  imports: [StorageModule],
  controllers: [UploadController],
  providers: [UploadTokenGuard, UploadLinkRepository, DocumentRepository, UploadService],
  exports: [UploadService, DocumentRepository, UploadLinkRepository],
})
export class UploadModule {}
