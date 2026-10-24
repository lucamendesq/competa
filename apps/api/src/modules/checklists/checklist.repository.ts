import { Injectable } from '@nestjs/common';
import type {
  CreateOverrideBody,
  CreateTemplateItemBody,
  UpdateTemplateItemBody,
} from '@competa/contracts';
import { run } from '../../effect/runtime.js';
import type { FirmScope } from '../auth/scope.js';
import { ChecklistsRepo } from './checklist.repo.js';

/** Casca Nest sobre o serviço Effect (`checklist.repo.ts`): mantém a DI dos controllers e
 *  dos scripts de verificação até cada consumidor migrar; morre na fase final. */
@Injectable()
export class ChecklistRepository {
  listDocumentTypes(scope: FirmScope, query: { category?: string; page: number; perPage: number }) {
    return run(ChecklistsRepo.use((repo) => repo.listDocumentTypes(scope, query)));
  }

  documentTypesVisible(scope: FirmScope, ids: string[]) {
    return run(ChecklistsRepo.use((repo) => repo.documentTypesVisible(scope, ids)));
  }

  listTemplates(scope: FirmScope) {
    return run(ChecklistsRepo.use((repo) => repo.listTemplates(scope)));
  }

  findTemplate(scope: FirmScope, templateId: string) {
    return run(ChecklistsRepo.use((repo) => repo.findTemplate(scope, templateId)));
  }

  listTemplateItems(templateId: string) {
    return run(ChecklistsRepo.use((repo) => repo.listTemplateItems(templateId)));
  }

  listItemsForTemplates(templateIds: string[]) {
    return run(ChecklistsRepo.use((repo) => repo.listItemsForTemplates(templateIds)));
  }

  templateItemsForCompany(scope: FirmScope, companyId: string) {
    return run(ChecklistsRepo.use((repo) => repo.templateItemsForCompany(scope, companyId)));
  }

  listOverrides(scope: FirmScope, companyId: string) {
    return run(ChecklistsRepo.use((repo) => repo.listOverrides(scope, companyId)));
  }

  listOverridesForCompanies(scope: FirmScope, companyIds: string[]) {
    return run(ChecklistsRepo.use((repo) => repo.listOverridesForCompanies(scope, companyIds)));
  }

  createTemplate(scope: FirmScope, input: { name: string; derivedFrom: string | null }) {
    return run(ChecklistsRepo.use((repo) => repo.createTemplate(scope, input)));
  }

  copyItems(fromTemplateId: string, toTemplateId: string) {
    return run(ChecklistsRepo.use((repo) => repo.copyItems(fromTemplateId, toTemplateId)));
  }

  renameTemplate(scope: FirmScope, templateId: string, name: string) {
    return run(ChecklistsRepo.use((repo) => repo.renameTemplate(scope, templateId, name)));
  }

  deriveTemplate(scope: FirmScope, source: { id: string; name: string }, name?: string) {
    return run(ChecklistsRepo.use((repo) => repo.deriveTemplate(scope, source, name)));
  }

  addTemplateItem(scope: FirmScope, templateId: string, body: CreateTemplateItemBody) {
    return run(ChecklistsRepo.use((repo) => repo.addTemplateItem(scope, templateId, body)));
  }

  updateTemplateItem(
    scope: FirmScope,
    templateId: string,
    itemId: string,
    body: UpdateTemplateItemBody,
  ) {
    return run(
      ChecklistsRepo.use((repo) => repo.updateTemplateItem(scope, templateId, itemId, body)),
    );
  }

  deleteTemplateItem(scope: FirmScope, templateId: string, itemId: string) {
    return run(ChecklistsRepo.use((repo) => repo.deleteTemplateItem(scope, templateId, itemId)));
  }

  upsertOverride(scope: FirmScope, companyId: string, body: CreateOverrideBody) {
    return run(ChecklistsRepo.use((repo) => repo.upsertOverride(scope, companyId, body)));
  }

  deleteOverride(scope: FirmScope, companyId: string, documentTypeId: string) {
    return run(ChecklistsRepo.use((repo) => repo.deleteOverride(scope, companyId, documentTypeId)));
  }

  companyChecklistContext(scope: FirmScope, companyId: string) {
    return run(ChecklistsRepo.use((repo) => repo.companyChecklistContext(scope, companyId)));
  }

  effectiveChecklist(scope: FirmScope, companyId: string) {
    return run(ChecklistsRepo.use((repo) => repo.effectiveChecklist(scope, companyId)));
  }

  countCompaniesUsingTemplate(scope: FirmScope, templateId: string) {
    return run(ChecklistsRepo.use((repo) => repo.countCompaniesUsingTemplate(scope, templateId)));
  }

  deleteTemplate(scope: FirmScope, templateId: string) {
    return run(ChecklistsRepo.use((repo) => repo.deleteTemplate(scope, templateId)));
  }
}
