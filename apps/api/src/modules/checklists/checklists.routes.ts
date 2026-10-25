import {
  CompanyIdParam,
  CreateOverrideBody,
  CreateTemplateBody,
  CreateTemplateItemBody,
  DeriveTemplateBody,
  DocumentTypeQuery,
  IdParam,
  OverrideParam,
  TemplateItemParam,
  UpdateTemplateBody,
  UpdateTemplateItemBody,
} from '@competa/contracts';
import { Effect, Layer } from 'effect';
import { FirmContext } from '../../http/context.js';
import { handler, paginated } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, params, query, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import type { FirmScope } from '../auth/scope.js';
import { ChecklistsRepo } from './checklist.repo.js';
import {
  DocumentTypeNotVisible,
  OverrideRemovesNothing,
  TemplateAlreadyOwned,
  TemplateImmutable,
  TemplateInUse,
  TemplateItemDuplicated,
} from './errors.js';

const requireVisible = (scope: FirmScope, templateId: string) =>
  Effect.gen(function* () {
    const template = yield* ChecklistsRepo.use((repo) => repo.findTemplate(scope, templateId));
    if (!template) return yield* Effect.fail(new NotFound('Template não encontrado.'));

    return template;
  });

const requireOwned = (scope: FirmScope, templateId: string) =>
  Effect.gen(function* () {
    const template = yield* requireVisible(scope, templateId);
    if (!template.accountingFirmId) return yield* Effect.fail(new TemplateImmutable());

    return template;
  });

const requireCompany = (scope: FirmScope, companyId: string) =>
  Effect.gen(function* () {
    const context = yield* ChecklistsRepo.use((repo) =>
      repo.companyChecklistContext(scope, companyId),
    );
    if (!context) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

    return context;
  });

const listTemplates = route(
  'GET',
  '/checklist-templates',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* ChecklistsRepo.use((repo) => repo.listTemplates(scope));
    }),
  ),
  { auth: firmRoute() },
);

const getTemplate = route(
  'GET',
  '/checklist-templates/:id',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const template = yield* requireVisible(scope, id);

      return {
        ...template,
        items: yield* ChecklistsRepo.use((repo) => repo.listTemplateItems(template.id)),
      };
    }),
  ),
  { auth: firmRoute() },
);

const createTemplate = route(
  'POST',
  '/checklist-templates',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const input = yield* body(CreateTemplateBody);

      const row = yield* ChecklistsRepo.use((repo) =>
        repo.createTemplate(scope, { name: input.name, derivedFrom: null }),
      );

      return { ...row, itemCount: 0 };
    }),
  ),
  { auth: firmRoute() },
);

const deriveTemplate = route(
  'POST',
  '/checklist-templates/:id/derive',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(DeriveTemplateBody);

      const source = yield* requireVisible(scope, id);
      if (source.accountingFirmId) return yield* Effect.fail(new TemplateAlreadyOwned());

      return yield* ChecklistsRepo.use((repo) => repo.deriveTemplate(scope, source, input.name));
    }),
  ),
  { auth: firmRoute() },
);

const renameTemplate = route(
  'PATCH',
  '/checklist-templates/:id',
  handler(
    'PATCH',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(UpdateTemplateBody);

      yield* requireOwned(scope, id);

      return yield* ChecklistsRepo.use((repo) => repo.renameTemplate(scope, id, input.name));
    }),
  ),
  { auth: firmRoute() },
);

const deleteTemplate = route(
  'DELETE',
  '/checklist-templates/:id',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      yield* requireOwned(scope, id);

      const count = yield* ChecklistsRepo.use((repo) =>
        repo.countCompaniesUsingTemplate(scope, id),
      );
      if (count > 0) return yield* Effect.fail(new TemplateInUse(count));

      const row = yield* ChecklistsRepo.use((repo) => repo.deleteTemplate(scope, id));
      if (!row) return yield* Effect.fail(new NotFound('Template não encontrado.'));
    }),
    204,
  ),
  { auth: firmRoute() },
);

const addItem = route(
  'POST',
  '/checklist-templates/:id/items',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(CreateTemplateItemBody);

      yield* requireOwned(scope, id);

      const [visible] = yield* ChecklistsRepo.use((repo) =>
        repo.documentTypesVisible(scope, [input.documentTypeId]),
      );
      if (!visible) return yield* Effect.fail(new DocumentTypeNotVisible());

      const row = yield* ChecklistsRepo.use((repo) => repo.addTemplateItem(scope, id, input));
      if (!row) return yield* Effect.fail(new TemplateItemDuplicated());

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const updateItem = route(
  'PATCH',
  '/checklist-templates/:id/items/:itemId',
  handler(
    'PATCH',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id, itemId } = yield* params(TemplateItemParam);
      const input = yield* body(UpdateTemplateItemBody);

      yield* requireOwned(scope, id);

      const row = yield* ChecklistsRepo.use((repo) =>
        repo.updateTemplateItem(scope, id, itemId, input),
      );
      if (!row) return yield* Effect.fail(new NotFound('Item do template não encontrado.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const removeItem = route(
  'DELETE',
  '/checklist-templates/:id/items/:itemId',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id, itemId } = yield* params(TemplateItemParam);

      yield* requireOwned(scope, id);

      const row = yield* ChecklistsRepo.use((repo) => repo.deleteTemplateItem(scope, id, itemId));
      if (!row) return yield* Effect.fail(new NotFound('Item do template não encontrado.'));
    }),
    204,
  ),
  { auth: firmRoute() },
);

const effectiveChecklist = route(
  'GET',
  '/companies/:companyId/checklist',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { companyId } = yield* params(CompanyIdParam);

      const checklist = yield* ChecklistsRepo.use((repo) =>
        repo.effectiveChecklist(scope, companyId),
      );
      if (!checklist) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return checklist;
    }),
  ),
  { auth: firmRoute() },
);

const listOverrides = route(
  'GET',
  '/companies/:companyId/checklist-overrides',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { companyId } = yield* params(CompanyIdParam);

      yield* requireCompany(scope, companyId);

      return yield* ChecklistsRepo.use((repo) => repo.listOverrides(scope, companyId));
    }),
  ),
  { auth: firmRoute() },
);

const upsertOverride = route(
  'PUT',
  '/companies/:companyId/checklist-overrides',
  handler(
    'PUT',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { companyId } = yield* params(CompanyIdParam);
      const input = yield* body(CreateOverrideBody);

      yield* requireCompany(scope, companyId);

      const [visible] = yield* ChecklistsRepo.use((repo) =>
        repo.documentTypesVisible(scope, [input.documentTypeId]),
      );
      if (!visible) return yield* Effect.fail(new DocumentTypeNotVisible());

      /* Remover o que não está no template gravava uma linha morta e o Contador saía da tela
       * achando que tinha tirado algo do checklist. */
      if (input.action === 'remove') {
        const inTemplate = yield* ChecklistsRepo.use((repo) =>
          repo.templateItemsForCompany(scope, companyId),
        );
        if (!inTemplate.some((line) => line.documentTypeId === input.documentTypeId)) {
          return yield* Effect.fail(new OverrideRemovesNothing());
        }
      }

      return yield* ChecklistsRepo.use((repo) => repo.upsertOverride(scope, companyId, input));
    }),
  ),
  { auth: firmRoute() },
);

const removeOverride = route(
  'DELETE',
  '/companies/:companyId/checklist-overrides/:documentTypeId',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { companyId, documentTypeId } = yield* params(OverrideParam);

      yield* requireCompany(scope, companyId);

      const row = yield* ChecklistsRepo.use((repo) =>
        repo.deleteOverride(scope, companyId, documentTypeId),
      );
      if (!row) return yield* Effect.fail(new NotFound('Override não encontrado.'));
    }),
    204,
  ),
  { auth: firmRoute() },
);

const listDocumentTypes = route(
  'GET',
  '/document-types',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const page = yield* query(DocumentTypeQuery);

      const { rows, total } = yield* ChecklistsRepo.use((repo) =>
        repo.listDocumentTypes(scope, page),
      );

      return paginated(rows, { page: page.page, perPage: page.perPage, total });
    }),
  ),
  { auth: firmRoute() },
);

export const checklistsRoutes = Layer.mergeAll(
  listTemplates,
  getTemplate,
  createTemplate,
  deriveTemplate,
  renameTemplate,
  deleteTemplate,
  addItem,
  updateItem,
  removeItem,
  effectiveChecklist,
  listOverrides,
  upsertOverride,
  removeOverride,
  listDocumentTypes,
);
