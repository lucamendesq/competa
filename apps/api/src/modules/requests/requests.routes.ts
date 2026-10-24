import { IdParam } from '@competa/contracts';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { fromRuntime } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { params, route } from '../../http/platform.js';
import { NotFound, ServiceUnavailable } from '../../lib/app-error.js';
import { EVENTS, type UploadLinkResentEvent } from '../../lib/events.js';
import { createToken } from '../../lib/token.js';
import { InvalidTransition } from './errors.js';
import { RequestsRepo } from './request.repo.js';

const get = route(
  'GET',
  '/requests/:id',
  handler(
    'GET',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const row = yield* fromRuntime(RequestsRepo.use((repo) => repo.findById(scope, id)));
      if (!row) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));

      return row;
    }),
  ),
  { auth: firmRoute() },
);

const uploadLink = route(
  'POST',
  '/requests/:id/upload-link',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const link = yield* fromRuntime(RequestsRepo.use((repo) => repo.rotateUploadLink(scope, id)));
      if (!link) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));

      return { uploadUrl: `${env.WEB_URL}/envio/${link.token}`, contactEmail: link.contactEmail };
    }),
  ),
  { auth: firmRoute() },
);

const resendUploadLink = (events: EventEmitter2) =>
  route(
    'POST',
    '/requests/:id/upload-link/resend',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope } = yield* FirmContext;
        const { id } = yield* params(IdParam);

        const context = yield* fromRuntime(
          RequestsRepo.use((repo) => repo.uploadLinkContext(scope, id)),
        );
        if (!context) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));
        if (context.requestStatus === 'closed') {
          return yield* Effect.fail(
            new InvalidTransition('Solicitação encerrada — não há mais link de envio.'),
          );
        }

        const { token, tokenHash } = createToken();
        const resent: UploadLinkResentEvent = {
          requestId: id,
          referenceMonth: context.referenceMonth,
          periodDueDate: context.periodDueDate,
          companyName: context.companyName,
          contactName: context.contactName,
          contactEmail: context.contactEmail,
          uploadUrl: `${env.WEB_URL}/envio/${token}`,
        };

        /* Bug congelado #13: `onUploadLinkResent` não devolve booleano, então o
         * `includes(true)` nunca casa e a rota responde 503 DEPOIS de o email já ter
         * saído — com um token que `applyUploadToken` nunca chega a oficializar. */
        const delivered = yield* Effect.promise(() =>
          events.emitAsync(EVENTS.UploadLinkResent, resent),
        );
        if (!delivered.includes(true)) {
          return yield* Effect.fail(
            new ServiceUnavailable(
              'Não foi possível entregar o novo link por email. Tente novamente.',
            ),
          );
        }

        yield* fromRuntime(RequestsRepo.use((repo) => repo.applyUploadToken(id, tokenHash)));

        return { uploadUrl: resent.uploadUrl, contactEmail: context.contactEmail };
      }),
    ),
    { auth: firmRoute() },
  );

const close = route(
  'POST',
  '/requests/:id/close',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const closed = yield* fromRuntime(RequestsRepo.use((repo) => repo.closeRequest(scope, id)));
      if (!closed) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));

      return {
        ...closed,
        warning: closed.pendingItemCount
          ? `Solicitação encerrada com ${closed.pendingItemCount} item(ns) sem aceite.`
          : null,
      };
    }),
  ),
  { auth: firmRoute() },
);

export const requestsRoutes = (events: EventEmitter2) =>
  Layer.mergeAll(get, uploadLink, resendUploadLink(events), close);
