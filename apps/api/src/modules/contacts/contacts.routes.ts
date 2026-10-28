import type { IncomingMessage } from 'node:http';
import { NodeHttpServerRequest, NodeStream } from '@effect/platform-node';
import {
  ConfirmUploadBody,
  IdParam,
  MyPresignBody,
  PaginationQuery,
  PushSubscriptionBody,
  SetPasswordBody,
} from '@competa/contracts';
import { Effect, Layer } from 'effect';
import { HttpServerRequest, HttpServerResponse } from 'effect/http';
import * as z from 'zod';
import { BetterAuthAdapter } from '../../infra/auth/better-auth.adapter.js';
import { storage } from '../../infra/storage/storage.js';
import { ContactContext, UploadContext } from '../../http/context.js';
import { handler, paginated } from '../../http/envelope.js';
import { contactRoute, contactUploadRoute } from '../../http/middleware/auth.js';
import { body, params, query, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import { MessagesRepo } from '../messaging/message.repo.js';
import { PeriodsRepo } from '../periods/period.repo.js';
import { DocumentsRepo } from '../requests/document.repo.js';
import { servedContentType } from '../requests/file-rules.js';
import { RequestsRepo } from '../requests/request.repo.js';
import { effectiveDueDate } from '../requests/review-rules.js';
import { ContactsRepo } from './contact.repo.js';

const auth = new BetterAuthAdapter();

const PeriodDetailQuery = z.object({ companyId: z.uuid().optional() });

const profile = route(
  'GET',
  '/my/profile',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;

      const row = yield* ContactsRepo.use((repo) => repo.profile(scope));
      if (!row) return yield* Effect.fail(new NotFound('Responsável não encontrado.'));

      return row;
    }),
  ),
  { auth: contactRoute },
);

const pending = route(
  'GET',
  '/my/pending',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;

      const rows = yield* RequestsRepo.use((repo) => repo.pending(scope));

      return rows.map((row) => ({
        requestId: row.requestId,
        periodId: row.periodId,
        referenceMonth: row.referenceMonth,
        companyId: row.companyId,
        companyName: row.companyName,
        item: {
          id: row.itemId,
          name: row.itemName,
          description: row.description,
          acceptedFormats: row.acceptedFormats,
          status: row.itemStatus,
          dueDate: effectiveDueDate({ dueDate: row.itemDueDate, periodDueDate: row.periodDueDate }),
          rejections: row.rejections,
        },
      }));
    }),
  ),
  { auth: contactRoute },
);

const periods = route(
  'GET',
  '/my/periods',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;
      const page = yield* query(PaginationQuery);

      const { rows, total } = yield* PeriodsRepo.use((repo) => repo.periods(scope, page));

      return paginated(rows, { page: page.page, perPage: page.perPage, total });
    }),
  ),
  { auth: contactRoute },
);

const periodDetail = route(
  'GET',
  '/my/periods/:id',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;
      const { id } = yield* params(IdParam);
      const { companyId } = yield* query(PeriodDetailQuery);

      const row = yield* PeriodsRepo.use((repo) => repo.periodDetail(scope, id, companyId));
      if (!row) return yield* Effect.fail(new NotFound('Competência não encontrada.'));

      return row;
    }),
  ),
  { auth: contactRoute },
);

/* `Content-Type` e `Content-Disposition` saem como vieram, sem
 * `Content-Length` (o corpo é um stream). A allowlist de `servedContentType` é a primeira
 * barreira de XSS sobre conteúdo de terceiros — o que não está nela vira octet-stream. */
const documentContent = route(
  'GET',
  '/my/documents/:id/content',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;
      const { id } = yield* params(IdParam);

      const found = yield* RequestsRepo.use((repo) => repo.documentForRead(scope, id));
      if (!found) return yield* Effect.fail(new NotFound('Documento não encontrado.'));

      const { contentType, inline } = servedContentType(found.contentType);
      const readable = yield* Effect.promise(() => storage.openRead(found.storageKey));

      return HttpServerResponse.stream(NodeStream.fromReadable({ evaluate: () => readable }), {
        contentType,
        headers: {
          'content-disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(found.fileName)}`,
        },
      });
    }),
  ),
  { auth: contactRoute },
);

const subscribe = route(
  'POST',
  '/my/push/subscribe',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;
      const input = yield* body(PushSubscriptionBody);

      return yield* MessagesRepo.use((repo) => repo.savePushSubscription(scope, input));
    }),
  ),
  { auth: contactRoute },
);

const unsubscribe = route(
  'DELETE',
  '/my/push/subscribe',
  handler(
    'DELETE',
    Effect.gen(function* () {
      const { scope } = yield* ContactContext;
      const input = yield* body(PushSubscriptionBody.pick({ endpoint: true }));

      const row = yield* MessagesRepo.use((repo) =>
        repo.deletePushSubscription(scope, input.endpoint),
      );
      if (!row) return yield* Effect.fail(new NotFound('Inscrição não encontrada.'));
    }),
    204,
  ),
  { auth: contactRoute },
);

/** Primeira senha do Responsável: a ativação pelo Link apaga a credencial aleatória que o
 *  better-auth exige na criação, então aqui ela nasce de verdade. Quem já tem senha toma
 *  400 PASSWORD_ALREADY_SET e troca pelo fluxo de redefinição. */
const setPassword = route(
  'POST',
  '/my/password',
  handler(
    'POST',
    Effect.gen(function* () {
      const input = yield* body(SetPasswordBody);
      const request = yield* HttpServerRequest.HttpServerRequest;
      const headers = (NodeHttpServerRequest.toIncomingMessage(request) as IncomingMessage).headers;

      yield* Effect.promise(() => auth.setPassword(headers, input.password));
    }),
    204,
  ),
  { auth: contactRoute },
);

/* Upload logado: o `UploadScope` nasce no `contactUploadRoute`, que confere a Solicitação
 * contra a Empresa do Responsável — daí em diante é o mesmo pipeline do fluxo por link. */
const presign = route(
  'POST',
  '/my/documents',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;
      const input = yield* body(MyPresignBody);

      return yield* DocumentsRepo.use((repo) => repo.presign(scope, input));
    }),
  ),
  { auth: contactUploadRoute },
);

const confirm = route(
  'POST',
  '/my/documents/confirm',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* UploadContext;
      const input = yield* body(
        ConfirmUploadBody.extend({ requestId: MyPresignBody.shape.requestId }),
      );

      return yield* DocumentsRepo.use((repo) => repo.confirm(scope, input.documentIds));
    }),
  ),
  { auth: contactUploadRoute },
);

export const contactsRoutes = Layer.mergeAll(
  profile,
  pending,
  periods,
  periodDetail,
  documentContent,
  subscribe,
  unsubscribe,
  setPassword,
  presign,
  confirm,
);
