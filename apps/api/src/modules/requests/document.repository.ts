import { Injectable } from '@nestjs/common';
import type { PresignUploadBody } from '@competa/contracts';
import { run } from '../../effect/runtime.js';
import type { UploadScope } from '../auth/scope.js';
import { DocumentsRepo } from './document.repo.js';

export type { ConfirmedDocument } from './document.repo.js';

/** Casca Nest sobre o serviço Effect (`document.repo.ts`): mantém a DI dos controllers, do
 *  cron de faxina e dos scripts de verificação até cada consumidor migrar; morre na fase
 *  final. O `StorageProvider` passou para dentro do serviço Effect — ver `document.repo.ts`. */
@Injectable()
export class DocumentRepository {
  presign(scope: UploadScope, body: PresignUploadBody) {
    return run(DocumentsRepo.use((repo) => repo.presign(scope, body)));
  }

  confirm(scope: UploadScope, documentIds: string[]) {
    return run(DocumentsRepo.use((repo) => repo.confirm(scope, documentIds)));
  }

  uploadContext(scope: UploadScope, requestItemId?: string | null) {
    return run(DocumentsRepo.use((repo) => repo.uploadContext(scope, requestItemId)));
  }

  createMany(
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
    return run(DocumentsRepo.use((repo) => repo.createMany(scope, documents)));
  }

  pendingUpload(scope: UploadScope, documentIds: string[]) {
    return run(DocumentsRepo.use((repo) => repo.pendingUpload(scope, documentIds)));
  }

  discard(documentIds: string[]) {
    return run(DocumentsRepo.use((repo) => repo.discard(documentIds)));
  }

  staleAwaitingUpload(olderThan: Date) {
    return run(DocumentsRepo.use((repo) => repo.staleAwaitingUpload(olderThan)));
  }

  expiredFiscalDocuments(olderThan: Date, limit = 1000) {
    return run(DocumentsRepo.use((repo) => repo.expiredFiscalDocuments(olderThan, limit)));
  }

  purgeFiscalDocuments(documentIds: string[]) {
    return run(DocumentsRepo.use((repo) => repo.purgeFiscalDocuments(documentIds)));
  }
}
