import { Injectable } from '@nestjs/common';
import { run } from '../../effect/runtime.js';
import type { UploadScope } from '../auth/scope.js';
import { UploadLinksRepo } from './upload-link.repo.js';

/** Casca Nest sobre o serviço Effect (`upload-link.repo.ts`): mantém a DI do
 *  `UploadTokenGuard` e dos controllers até cada consumidor migrar; morre na fase final. */
@Injectable()
export class UploadLinkRepository {
  findByTokenHash(tokenHash: string) {
    return run(UploadLinksRepo.use((repo) => repo.findByTokenHash(tokenHash)));
  }

  findChecklist(scope: UploadScope) {
    return run(UploadLinksRepo.use((repo) => repo.findChecklist(scope)));
  }

  findContact(scope: UploadScope) {
    return run(UploadLinksRepo.use((repo) => repo.findContact(scope)));
  }
}
