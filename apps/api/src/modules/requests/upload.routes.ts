import { ConfirmUploadBody, PresignUploadBody } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import { UploadContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { uploadPresignRoute, uploadTokenRoute } from '../../http/middleware/auth.js';
import { body, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { DocumentsRepo } from './document.repo.js';
import { UploadLinksRepo } from './upload-link.repo.js';

/* Superfície só-escrita: nome de arquivo e storage key NUNCA saem daqui — quem tem o link
 * não tem a Empresa. `requests.e2e.spec.ts` prende o conjunto de chaves em cada nível. */
const checklist = route(
  'GET',
  '/upload/:token',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;

      const [found, owner] = yield* Effect.all(
        [
          UploadLinksRepo.use((repo) => repo.findChecklist(scope)),
          UploadLinksRepo.use((repo) => repo.findContact(scope)),
        ],
        { concurrency: 'unbounded' },
      );
      if (!found) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));

      return {
        company: found.companyName,
        accountingFirm: found.accountingFirmName,
        accountingFirmLogoUrl: found.accountingFirmLogoUrl,
        hasAccess: Boolean(owner?.authUserId),
        referenceMonth: found.referenceMonth,
        dueDate: found.periodDueDate,
        status: found.status,
        items: found.items.map((item) => ({
          ...item,
          dueDate: item.dueDate ?? found.periodDueDate,
        })),
        extraDocuments: found.extraDocuments,
      };
    }),
  ),
  { auth: uploadTokenRoute({ uploadThrottle: true }) },
);

/* `@SkipThrottle({ short: true, default: true })` em cima do `UploadThrottlerGuard`: sobra
 * só o balde de 60/60s por `ip:token`, que é o que autoriza o lote de arquivos. */
const presign = route(
  'POST',
  '/upload/:token/documents',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;
      const input = yield* body(PresignUploadBody);

      return yield* DocumentsRepo.use((repo) => repo.presign(scope, input));
    }),
  ),
  { auth: uploadPresignRoute },
);

const confirm = route(
  'POST',
  '/upload/:token/documents/confirm',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;
      const input = yield* body(ConfirmUploadBody);

      return yield* DocumentsRepo.use((repo) => repo.confirm(scope, input.documentIds));
    }),
  ),
  { auth: uploadTokenRoute({ uploadThrottle: true }) },
);

export const uploadRoutes = Layer.mergeAll(checklist, presign, confirm);
