import { Injectable } from '@nestjs/common';
import type { ContactBody, CreateCompanyBody, UpdateCompanyBody } from '@competa/contracts';
import { run } from '../../effect/runtime.js';
import type { FirmScope } from '../auth/scope.js';
import { CompaniesRepo, type PendingImportRow } from './company.repo.js';

export type { ImportLineResult, ImportPreviewLine, PendingImportRow } from './company.repo.js';

/** Casca Nest sobre o serviço Effect (`company.repo.ts`): mantém a DI do controller e dos
 *  scripts de verificação até cada consumidor migrar; morre na fase final. */
@Injectable()
export class CompanyRepository {
  templateIsVisible(scope: FirmScope, templateId: string) {
    return run(CompaniesRepo.use((repo) => repo.templateIsVisible(scope, templateId)));
  }

  usage(scope: FirmScope) {
    return run(CompaniesRepo.use((repo) => repo.usage(scope)));
  }

  create(scope: FirmScope, body: CreateCompanyBody) {
    return run(CompaniesRepo.use((repo) => repo.create(scope, body)));
  }

  list(
    scope: FirmScope,
    query: { active?: boolean; search?: string; page: number; perPage: number },
  ) {
    return run(CompaniesRepo.use((repo) => repo.list(scope, query)));
  }

  findById(scope: FirmScope, companyId: string) {
    return run(CompaniesRepo.use((repo) => repo.findById(scope, companyId)));
  }

  update(scope: FirmScope, companyId: string, body: UpdateCompanyBody) {
    return run(CompaniesRepo.use((repo) => repo.update(scope, companyId, body)));
  }

  deactivate(scope: FirmScope, companyId: string) {
    return run(CompaniesRepo.use((repo) => repo.deactivate(scope, companyId)));
  }

  activateMany(scope: FirmScope, companyIds: string[]) {
    return run(CompaniesRepo.use((repo) => repo.activateMany(scope, companyIds)));
  }

  listContacts(scope: FirmScope, companyId: string) {
    return run(CompaniesRepo.use((repo) => repo.listContacts(scope, companyId)));
  }

  addContact(scope: FirmScope, companyId: string, body: ContactBody) {
    return run(CompaniesRepo.use((repo) => repo.addContact(scope, companyId, body)));
  }

  updateContact(
    scope: FirmScope,
    companyId: string,
    contactId: string,
    body: Partial<ContactBody>,
  ) {
    return run(CompaniesRepo.use((repo) => repo.updateContact(scope, companyId, contactId, body)));
  }

  deleteContact(scope: FirmScope, companyId: string, contactId: string) {
    return run(CompaniesRepo.use((repo) => repo.deleteContact(scope, companyId, contactId)));
  }

  findOwnedId(scope: FirmScope, companyId: string) {
    return run(CompaniesRepo.use((repo) => repo.findOwnedId(scope, companyId)));
  }

  validateCsv(csv: string) {
    return run(CompaniesRepo.use((repo) => repo.validateCsv(csv)));
  }

  confirmImport(scope: FirmScope, pending: PendingImportRow[], activate = true) {
    return run(CompaniesRepo.use((repo) => repo.confirmImport(scope, pending, activate)));
  }
}
