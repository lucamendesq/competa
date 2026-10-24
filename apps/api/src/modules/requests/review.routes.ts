import { IdParam, RejectDocumentBody, ReviewBatchBody, ReviewExtraBody } from '@competa/contracts';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
import { fromRuntime } from '../../effect/runtime.js';
import { FirmContext } from '../../http/context.js';
import { handler } from '../../http/envelope.js';
import { firmRoute } from '../../http/middleware/auth.js';
import { body, params, route } from '../../http/platform.js';
import { NotFound } from '../../lib/app-error.js';
import {
  EVENTS,
  type ItemReopenedEvent,
  type RequestCompletedEvent,
  type ReviewPublishedEvent,
} from '../../lib/events.js';
import type { FirmScope } from '../auth/scope.js';
import { RequestsRepo } from './request.repo.js';

/** A varredura de prazos continua sendo a instância do container Nest (o cron é a F5); a
 *  rota é só a versão HTTP dela, restrita à Contabilidade do chamador (AUTHZ-2). */
export type ScanDeadlines = (scope: FirmScope) => Promise<unknown>;

const acceptItem = (events: EventEmitter2) =>
  route(
    'POST',
    '/request-items/:id/accept',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope, accountantId } = yield* FirmContext;
        const { id } = yield* params(IdParam);

        const result = yield* fromRuntime(
          RequestsRepo.use((repo) => repo.acceptItem(scope, id, accountantId)),
        );
        if (!result) return yield* Effect.fail(new NotFound('Item não encontrado.'));

        if (result.completed) {
          const completed: RequestCompletedEvent = {
            requestId: result.requestId,
            companyName: result.companyName,
            contactName: result.contactName,
            contactEmail: result.contactEmail,
          };

          events.emit(EVENTS.RequestCompleted, completed);
        }

        return result;
      }),
    ),
    { auth: firmRoute() },
  );

/** A revisão da tela inteira publicada de uma vez. Um email só sai daqui:
 *  `ReviewPublished` quando houve rejeição, `RequestCompleted` quando o lote fechou a
 *  Solicitação — nunca os dois (completar exige todo item aceito). Só aceite que não
 *  completa não manda email, igual à rota unitária. */
const publishReview = (events: EventEmitter2) =>
  route(
    'POST',
    '/requests/:id/review',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope, accountantId } = yield* FirmContext;
        const { id } = yield* params(IdParam);
        const input = yield* body(ReviewBatchBody);

        const result = yield* fromRuntime(
          RequestsRepo.use((repo) => repo.applyReview(scope, id, input, accountantId)),
        );
        if (!result) return yield* Effect.fail(new NotFound('Solicitação não encontrada.'));

        // Depois da transação: um email de recusa não pode sair por uma revisão que deu
        // rollback (mesma ordem da rota unitária).
        if (result.rejected.length) {
          const published: ReviewPublishedEvent = {
            requestId: result.requestId,
            companyName: result.companyName,
            contactName: result.contactName,
            contactEmail: result.contactEmail,
            acceptedItemNames: result.acceptedItemNames,
            rejected: result.rejected,
            uploadUrl: result.token ? `${env.WEB_URL}/envio/${result.token}` : null,
          };

          events.emit(EVENTS.ReviewPublished, published);
        } else if (result.completed) {
          const completed: RequestCompletedEvent = {
            requestId: result.requestId,
            companyName: result.companyName,
            contactName: result.contactName,
            contactEmail: result.contactEmail,
          };

          events.emit(EVENTS.RequestCompleted, completed);
        }

        return {
          requestId: result.requestId,
          requestStatus: result.requestStatus,
          completed: result.completed,
          acceptedItems: result.acceptedItemNames.length,
          rejectedDocuments: result.rejected.length,
          linkRotated: Boolean(result.token),
          emailSent: result.rejected.length > 0 || result.completed,
        };
      }),
    ),
    { auth: firmRoute() },
  );

const rejectDocument = (events: EventEmitter2) =>
  route(
    'POST',
    '/documents/:id/reject',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope, accountantId } = yield* FirmContext;
        const { id } = yield* params(IdParam);
        const input = yield* body(RejectDocumentBody);

        const result = yield* fromRuntime(
          RequestsRepo.use((repo) =>
            repo.rejectDocument(scope, id, input.rejectionReason, accountantId),
          ),
        );
        if (!result) return yield* Effect.fail(new NotFound('Documento não encontrado.'));

        // Emitido depois da transação: o email de reenvio não pode sair por uma rejeição que
        // deu rollback. Quem entrega é a Fase 5 (SÓ email, invariante do domínio).
        const reopened: ItemReopenedEvent = {
          requestId: result.requestId,
          requestItemId: result.requestItemId,
          itemName: result.itemName,
          rejectionReason: result.rejectionReason,
          companyName: result.companyName,
          contactName: result.contactName,
          contactEmail: result.contactEmail,
          uploadUrl: `${env.WEB_URL}/envio/${result.token}`,
        };

        events.emit(EVENTS.ItemReopened, reopened);

        /* Bug congelado #16: `linkRotated: true` é fixo, mas `rotateLinkOnReopen` guarda o
         * hash anterior em `previous_token_hash` — o link velho vale mais 48h. */
        return {
          documentId: id,
          fileName: result.fileName,
          reviewStatus: 'rejected',
          requestItemId: result.requestItemId,
          itemStatus: 'pending',
          requestStatus: result.requestStatus,
          linkRotated: true,
        };
      }),
    ),
    { auth: firmRoute() },
  );

const reviewExtra = route(
  'POST',
  '/documents/:id/review-extra',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope, accountantId } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(ReviewExtraBody);

      const result = yield* fromRuntime(
        RequestsRepo.use((repo) =>
          repo.reviewExtraDocument(
            scope,
            id,
            { reviewStatus: input.decision, rejectionReason: input.rejectionReason },
            accountantId,
          ),
        ),
      );
      if (!result) return yield* Effect.fail(new NotFound('Documento não encontrado.'));

      return result;
    }),
  ),
  { auth: firmRoute() },
);

const undoAccept = route(
  'POST',
  '/request-items/:id/undo-accept',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const result = yield* fromRuntime(RequestsRepo.use((repo) => repo.undoAcceptItem(scope, id)));
      if (!result) return yield* Effect.fail(new NotFound('Item não encontrado.'));

      return result;
    }),
  ),
  { auth: firmRoute() },
);

const scanDeadlines = (scan: ScanDeadlines) =>
  route(
    'POST',
    '/deadlines/scan',
    handler(
      'POST',
      Effect.gen(function* () {
        const { scope } = yield* FirmContext;

        return yield* Effect.promise(() => scan(scope));
      }),
    ),
    { auth: firmRoute() },
  );

/** Revisão no painel do Contador (sessão + FirmScope). Recurso de outra Contabilidade
 *  responde 404: o join até `period` não o alcança e nada revela que ele existe. */
export const reviewRoutes = (events: EventEmitter2, scan: ScanDeadlines) =>
  Layer.mergeAll(
    acceptItem(events),
    publishReview(events),
    rejectDocument(events),
    reviewExtra,
    undoAccept,
    scanDeadlines(scan),
  );
