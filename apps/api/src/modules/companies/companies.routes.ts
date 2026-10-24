import {
  ActivateCompaniesBody,
  ApplyTemplateBody,
  CompanyQuery,
  ContactBody,
  CreateCompanyBody,
  IdParam,
  ImportCompaniesBody,
  ImportConfirmBody,
  SendAccessInvitesBody,
  UpdateCompanyBody,
} from '@competa/contracts';
import type { EventEmitter2 } from '../../lib/event-emitter.js';
import { addDays } from 'date-fns';
import { Effect, Layer } from 'effect';
import * as z from 'zod';
import env from '../../config/env.js';
import { fromRuntime, withDb } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler, paginated } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, params, query, route } from '../../http/platform.js';
import { NotFound, ValidationError } from '../../lib/app-error.js';
import { EVENTS, type ContactInvitedEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import { AccountantRepository } from '../auth/accountant.repository.js';
import { InviteRepository } from '../auth/invite.repository.js';
import type { FirmScope } from '../auth/scope.js';
import { ContactsRepo } from '../contacts/contact.repo.js';
import { CompaniesRepo } from './company.repo.js';

const ContactParam = z.object({ id: z.uuid(), contactId: z.uuid() });

const useCompanies = <A, E>(f: (repo: CompaniesRepo['Service']) => Effect.Effect<A, E>) =>
  fromRuntime(CompaniesRepo.use(f));

const useContacts = <A, E>(f: (repo: ContactsRepo['Service']) => Effect.Effect<A, E>) =>
  fromRuntime(ContactsRepo.use(f));

/* `responsibleAccountantId` vem do corpo. Sem este filtro, um id de outra Contabilidade
 * é gravado e o `leftJoin` da listagem passa a devolver o NOME do funcionário dela —
 * enumeração de equipe alheia. */
const requireAccountant = (scope: FirmScope, accountantId: string) =>
  Effect.gen(function* () {
    const found = yield* withDb((db) =>
      new AccountantRepository(db).findInFirm(scope, accountantId),
    );
    if (!found) {
      return yield* Effect.fail(
        new ValidationError('Contador responsável inexistente ou de outra Contabilidade.'),
      );
    }
  });

const requireTemplate = (scope: FirmScope, templateId: string) =>
  Effect.gen(function* () {
    const visible = yield* useCompanies((repo) => repo.templateIsVisible(scope, templateId));
    if (!visible) {
      return yield* Effect.fail(
        new ValidationError('Template de checklist inexistente ou de outra Contabilidade.'),
      );
    }
  });

const inviteToApp = (
  events: EventEmitter2,
  scope: FirmScope,
  input: {
    readonly companyId: string;
    readonly companyName: string;
    readonly contact: { id: string; name: string; email: string };
    readonly createdBy?: string;
  },
): Effect.Effect<{ sent: boolean; reason?: string }> =>
  Effect.gen(function* () {
    const taken = yield* useContacts((repo) => repo.userByEmail(input.contact.email));
    if (taken) return { sent: false, reason: 'Este e-mail já tem uma conta cadastrada.' };

    yield* withDb((db) =>
      new InviteRepository(db).revokePendingForContact(input.companyId, input.contact.email),
    );

    const { token, tokenHash } = createToken();
    const expiresAt = addDays(new Date(), env.INVITE_TTL_DAYS);

    yield* withDb((db) =>
      new InviteRepository(db).createForCompany({
        companyId: input.companyId,
        email: input.contact.email,
        tokenHash,
        expiresAt,
        createdBy: input.createdBy,
      }),
    );

    const invited: ContactInvitedEvent = {
      contactId: input.contact.id,
      contactName: input.contact.name,
      contactEmail: input.contact.email,
      companyName: input.companyName,
      firmName: yield* withDb((db) => new InviteRepository(db).firmName(scope)),
      inviteUrl: `${env.WEB_URL}/convite/${token}`,
      expiresAt,
    };

    events.emit(EVENTS.ContactInvited, invited);

    return { sent: true };
  });

const list = route(
  'GET',
  '/companies',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const page = yield* query(CompanyQuery);

      const { rows, total } = yield* useCompanies((repo) => repo.list(scope, page));

      return paginated(rows, { page: page.page, perPage: page.perPage, total });
    }),
  ),
  { auth: firmRoute() },
);

/** Antes de `GET /companies/:id`: no Nest a ordem de declaração era a ordem de match, e o
 *  roteador novo prefere o segmento estático ao parâmetro. Os dois concordam aqui. */
const usage = route(
  'GET',
  '/companies/usage',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* useCompanies((repo) => repo.usage(scope));
    }),
  ),
  { auth: firmRoute() },
);

const create = route(
  'POST',
  '/companies',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const input = yield* body(CreateCompanyBody);

      if (input.checklistTemplateId) yield* requireTemplate(scope, input.checklistTemplateId);
      if (input.responsibleAccountantId) {
        yield* requireAccountant(scope, input.responsibleAccountantId);
      }

      return yield* useCompanies((repo) => repo.create(scope, input));
    }),
  ),
  { auth: firmRoute() },
);

const sendAccessInvites = (events: EventEmitter2) =>
  route(
    'POST',
    '/companies/access-invites',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope, accountantId } = yield* FirmContext;
        const input = yield* body(SendAccessInvitesBody);

        const results: Array<{
          companyId: string;
          companyName?: string;
          email?: string;
          status: 'invited' | 'skipped' | 'error';
          reason?: string;
        }> = [];

        for (const companyId of input.companyIds) {
          const found = yield* useCompanies((repo) => repo.findById(scope, companyId));
          if (!found) {
            results.push({ companyId, status: 'error', reason: 'Empresa não encontrada.' });
            continue;
          }

          for (const contact of found.contacts) {
            const sent = yield* inviteToApp(events, scope, {
              companyId,
              companyName: found.name,
              contact,
              createdBy: accountantId,
            });

            results.push({
              companyId,
              companyName: found.name,
              email: contact.email,
              status: sent.sent ? 'invited' : 'skipped',
              reason: sent.reason,
            });
          }

          if (!found.contacts.length) {
            results.push({
              companyId,
              companyName: found.name,
              status: 'skipped',
              reason: 'Empresa sem Responsável cadastrado.',
            });
          }
        }

        return {
          invited: results.filter((row) => row.status === 'invited').length,
          skipped: results.filter((row) => row.status !== 'invited').length,
          results,
        };
      }),
    ),
    { auth: firmRoute() },
  );

const applyTemplate = route(
  'POST',
  '/companies/apply-template',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const input = yield* body(ApplyTemplateBody);

      yield* requireTemplate(scope, input.checklistTemplateId);

      const results: Array<{
        companyId: string;
        status: 'updated' | 'error';
        reason?: string;
      }> = [];

      for (const companyId of input.companyIds) {
        const row = yield* useCompanies((repo) =>
          repo.update(scope, companyId, { checklistTemplateId: input.checklistTemplateId }),
        );

        results.push(
          row
            ? { companyId, status: 'updated' }
            : { companyId, status: 'error', reason: 'Empresa não encontrada.' },
        );
      }

      return {
        updated: results.filter((row) => row.status === 'updated').length,
        results,
      };
    }),
  ),
  { auth: firmRoute() },
);

const importCompanies = route(
  'POST',
  '/companies/import',
  handler(
    'POST',
    Effect.gen(function* () {
      const input = yield* body(ImportCompaniesBody);

      return yield* useCompanies((repo) => repo.validateCsv(input.csv));
    }),
  ),
  { auth: firmRoute() },
);

const confirmImport = route(
  'POST',
  '/companies/import/confirm',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const input = yield* body(ImportConfirmBody);

      const templateIds = [
        ...new Set(
          input.pending
            .map((row) => row.body.checklistTemplateId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      for (const templateId of templateIds) {
        yield* requireTemplate(scope, templateId);
      }

      /* Bug congelado #4: o id é validado aqui e o `insertBatch` nunca grava a coluna —
       * a Empresa importada nasce com `responsibleAccountantId: null`. */
      const accountantIds = [
        ...new Set(
          input.pending
            .map((row) => row.body.responsibleAccountantId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

      for (const accountantId of accountantIds) {
        yield* requireAccountant(scope, accountantId);
      }

      return yield* useCompanies((repo) =>
        repo.confirmImport(scope, input.pending, input.activate),
      );
    }),
  ),
  { auth: firmRoute() },
);

const activate = route(
  'POST',
  '/companies/activate',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const input = yield* body(ActivateCompaniesBody);

      return yield* useCompanies((repo) => repo.activateMany(scope, input.companyIds));
    }),
  ),
  { auth: firmRoute() },
);

const get = route(
  'GET',
  '/companies/:id',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const row = yield* useCompanies((repo) => repo.findById(scope, id));
      if (!row) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const update = route(
  'PATCH',
  '/companies/:id',
  handler(
    'PATCH',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      /* Bug congelado #2: `UpdateCompanyBody` é todo parcial, `{}` passa na validação e o
       * drizzle estoura com `No values to set` → 500 em vez de 422. */
      const input = yield* body(UpdateCompanyBody);

      if (input.checklistTemplateId) yield* requireTemplate(scope, input.checklistTemplateId);
      if (input.responsibleAccountantId) {
        yield* requireAccountant(scope, input.responsibleAccountantId);
      }

      const row = yield* useCompanies((repo) => repo.update(scope, id, input));
      if (!row) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const deactivate = route(
  'DELETE',
  '/companies/:id',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const row = yield* useCompanies((repo) => repo.deactivate(scope, id));
      if (!row) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const listContacts = route(
  'GET',
  '/companies/:id/contacts',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const owned = yield* useCompanies((repo) => repo.findOwnedId(scope, id));
      if (!owned) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return yield* useCompanies((repo) => repo.listContacts(scope, id));
    }),
  ),
  { auth: firmRoute() },
);

const addContact = route(
  'POST',
  '/companies/:id/contacts',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(ContactBody);

      const row = yield* useCompanies((repo) => repo.addContact(scope, id, input));
      if (!row) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const updateContact = route(
  'PATCH',
  '/companies/:id/contacts/:contactId',
  handler(
    'PATCH',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id, contactId } = yield* params(ContactParam);
      // Bug congelado #3: mesma causa do #2, com `ContactBody.partial()`.
      const input = yield* body(ContactBody.partial());

      const row = yield* useCompanies((repo) => repo.updateContact(scope, id, contactId, input));
      if (!row) return yield* Effect.fail(new NotFound('Responsável não encontrado.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const deleteContact = route(
  'DELETE',
  '/companies/:id/contacts/:contactId',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id, contactId } = yield* params(ContactParam);

      const row = yield* useCompanies((repo) => repo.deleteContact(scope, id, contactId));
      if (!row) return yield* Effect.fail(new NotFound('Responsável não encontrado.'));
    }),
    204,
  ),
  { auth: firmRoute() },
);

const listContactAccess = route(
  'GET',
  '/companies/:id/contacts/access',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const owned = yield* useContacts((repo) => repo.findOwnedCompany(scope, id));
      if (!owned) return yield* Effect.fail(new NotFound('Empresa não encontrada.'));

      return yield* useContacts((repo) => repo.withAccess(scope, id));
    }),
  ),
  { auth: firmRoute() },
);

const revokeContactAccess = route(
  'DELETE',
  '/companies/:id/contacts/:contactId/access',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id, contactId } = yield* params(ContactParam);

      const result = yield* useContacts((repo) => repo.revokeAccess(scope, id, contactId));
      if (!result) return yield* Effect.fail(new NotFound('Responsável não encontrado.'));

      return result;
    }),
  ),
  { auth: firmRoute() },
);

export const companiesRoutes = (events: EventEmitter2) =>
  Layer.mergeAll(
    list,
    usage,
    create,
    sendAccessInvites(events),
    applyTemplate,
    importCompanies,
    confirmImport,
    activate,
    get,
    update,
    deactivate,
    listContacts,
    addContact,
    updateContact,
    deleteContact,
    listContactAccess,
    revokeContactAccess,
  );
