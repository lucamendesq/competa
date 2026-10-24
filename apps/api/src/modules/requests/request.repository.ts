import { Injectable } from '@nestjs/common';
import { run } from '../../effect/runtime.js';
import type { ContactScope, FirmScope } from '../auth/scope.js';
import { RequestsRepo } from './request.repo.js';
import type { ReviewStatus } from './review-rules.js';

/** Casca Nest sobre o serviço Effect (`request.repo.ts`): mantém a DI dos controllers, dos
 *  crons e dos scripts de verificação até cada consumidor migrar; morre na fase final. */
@Injectable()
export class RequestRepository {
  findById(scope: FirmScope, requestId: string) {
    return run(RequestsRepo.use((repo) => repo.findById(scope, requestId)));
  }

  acceptItem(scope: FirmScope, requestItemId: string, reviewedBy: string) {
    return run(RequestsRepo.use((repo) => repo.acceptItem(scope, requestItemId, reviewedBy)));
  }

  rejectDocument(scope: FirmScope, documentId: string, reason: string, reviewedBy: string) {
    return run(
      RequestsRepo.use((repo) => repo.rejectDocument(scope, documentId, reason, reviewedBy)),
    );
  }

  applyReview(
    scope: FirmScope,
    requestId: string,
    input: {
      acceptItemIds: string[];
      rejectDocuments: { documentId: string; rejectionReason: string }[];
      reviewExtras: { documentId: string; decision: ReviewStatus; rejectionReason?: string }[];
    },
    reviewedBy: string,
  ) {
    return run(RequestsRepo.use((repo) => repo.applyReview(scope, requestId, input, reviewedBy)));
  }

  closeRequest(scope: FirmScope, requestId: string) {
    return run(RequestsRepo.use((repo) => repo.closeRequest(scope, requestId)));
  }

  overdueItems(scope: FirmScope | null, today: string) {
    return run(RequestsRepo.use((repo) => repo.overdueItems(scope, today)));
  }

  accountantEmails(accountingFirmIds: string[]) {
    return run(RequestsRepo.use((repo) => repo.accountantEmails(accountingFirmIds)));
  }

  applyUploadToken(
    requestId: string,
    tokenHash: string,
    contactId?: string,
    options?: { revokePrevious?: boolean },
  ) {
    return run(
      RequestsRepo.use((repo) => repo.applyUploadToken(requestId, tokenHash, contactId, options)),
    );
  }

  rotateUploadToken(requestId: string, contactId?: string) {
    return run(RequestsRepo.use((repo) => repo.rotateUploadToken(requestId, contactId)));
  }

  uploadLinkContext(scope: FirmScope, requestId: string) {
    return run(RequestsRepo.use((repo) => repo.uploadLinkContext(scope, requestId)));
  }

  rotateUploadLink(scope: FirmScope, requestId: string) {
    return run(RequestsRepo.use((repo) => repo.rotateUploadLink(scope, requestId)));
  }

  markDeadlineNotified(requestItemIds: string[]) {
    return run(RequestsRepo.use((repo) => repo.markDeadlineNotified(requestItemIds)));
  }

  documentsForRequestZip(scope: FirmScope, requestId: string) {
    return run(RequestsRepo.use((repo) => repo.documentsForRequestZip(scope, requestId)));
  }

  documentForRead(scope: FirmScope | ContactScope, documentId: string) {
    return run(RequestsRepo.use((repo) => repo.documentForRead(scope, documentId)));
  }

  pending(scope: ContactScope) {
    return run(RequestsRepo.use((repo) => repo.pending(scope)));
  }

  documentsForPeriodZip(scope: FirmScope, periodId: string) {
    return run(RequestsRepo.use((repo) => repo.documentsForPeriodZip(scope, periodId)));
  }

  reviewExtraDocument(
    scope: FirmScope,
    documentId: string,
    decision: { reviewStatus: 'accepted' | 'rejected'; rejectionReason?: string },
    reviewedBy: string,
  ) {
    return run(
      RequestsRepo.use((repo) => repo.reviewExtraDocument(scope, documentId, decision, reviewedBy)),
    );
  }

  undoAcceptItem(scope: FirmScope, requestItemId: string) {
    return run(RequestsRepo.use((repo) => repo.undoAcceptItem(scope, requestItemId)));
  }

  reminderCandidates(scope?: FirmScope) {
    return run(RequestsRepo.use((repo) => repo.reminderCandidates(scope)));
  }

  reminderSettingsByFirm(firmIds: string[]) {
    return run(RequestsRepo.use((repo) => repo.reminderSettingsByFirm(firmIds)));
  }

  withAdvisoryLock<T>(lockId: number, task: () => Promise<T>) {
    return run(RequestsRepo.use((repo) => repo.withAdvisoryLock(lockId, task)));
  }
}
