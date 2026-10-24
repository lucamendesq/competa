import { run } from '../../effect/runtime.js';
import type { ContactScope, FirmScope } from '../auth/scope.js';
import { ContactsRepo } from './contact.repo.js';

/** Casca Nest sobre o serviço Effect (`contact.repo.ts`): mantém a DI dos controllers,
 *  guards e do CompaniesModule até cada consumidor migrar; morre na fase final. */
export class ContactRepository {
  profile(scope: ContactScope) {
    return run(ContactsRepo.use((repo) => repo.profile(scope)));
  }

  findByEmailInCompany(companyId: string, email: string) {
    return run(ContactsRepo.use((repo) => repo.findByEmailInCompany(companyId, email)));
  }

  openRequestsForEmail(email: string) {
    return run(ContactsRepo.use((repo) => repo.openRequestsForEmail(email)));
  }

  userByEmail(email: string) {
    return run(ContactsRepo.use((repo) => repo.userByEmail(email)));
  }

  markUserEmailVerified(userId: string) {
    return run(ContactsRepo.use((repo) => repo.markUserEmailVerified(userId)));
  }

  markTermsAccepted(userId: string) {
    return run(ContactsRepo.use((repo) => repo.markTermsAccepted(userId)));
  }

  linkAuthUser(contactId: string, authUserId: string) {
    return run(ContactsRepo.use((repo) => repo.linkAuthUser(contactId, authUserId)));
  }

  revokeAccess(scope: FirmScope, companyId: string, contactId: string) {
    return run(ContactsRepo.use((repo) => repo.revokeAccess(scope, companyId, contactId)));
  }

  findOwnedCompany(scope: FirmScope, companyId: string) {
    return run(ContactsRepo.use((repo) => repo.findOwnedCompany(scope, companyId)));
  }

  withAccess(scope: FirmScope, companyId: string) {
    return run(ContactsRepo.use((repo) => repo.withAccess(scope, companyId)));
  }

  contactsOf(companyIds: string[]) {
    return run(ContactsRepo.use((repo) => repo.contactsOf(companyIds)));
  }

  findMembershipsByAuthUser(authUserId: string) {
    return run(ContactsRepo.use((repo) => repo.findMembershipsByAuthUser(authUserId)));
  }

  findUploadOwnership(authUserId: string, requestId: string) {
    return run(ContactsRepo.use((repo) => repo.findUploadOwnership(authUserId, requestId)));
  }

  existsByAuthUser(authUserId: string) {
    return run(ContactsRepo.use((repo) => repo.existsByAuthUser(authUserId)));
  }
}
