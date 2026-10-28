import { IdParam, RejectDocumentBody, ReviewBatchBody, ReviewExtraBody } from '@competa/contracts';
import { Effect, Layer } from 'effect';
import env from '../../config/env.js';
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
import { Events } from '../../lib/events.service.js';
import { DeadlineScan } from './deadline.cron.js';
import { RequestsRepo } from './request.repo.js';

const acceptItem = route(
  'POST',
  '/request-items/:id/accept',
  handler(
    'POST',
    Effect.gen(function* () {
      const events = yield* Events;
      const { scope, accountantId } = yield* FirmContext;
      const { id } = yield* params(IdParam);

      const result = yield* RequestsRepo.use((repo) => repo.acceptItem(scope, id, accountantId));
      if (!result) return yield* Effect.fail(new NotFound('Item não encontrado.'));

      if (result.completed) {
        const completed: RequestCompletedEvent = {
          requestId: result.requestId,
          companyName: result.companyName,
          contactName: result.contactName,
          contactEmail: result.contactEmail,
        };

        yield* events.emit(EVENTS.RequestCompleted, completed);
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
const publishReview = route(
  'POST',
  '/requests/:id/review',
  handler(
    'POST',
    Effect.gen(function* () {
      const events = yield* Events;
      const { scope, accountantId } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(ReviewBatchBody);

      const result = yield* RequestsRepo.use((repo) =>
        repo.applyReview(scope, id, input, accountantId),
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

        yield* events.emit(EVENTS.ReviewPublished, published);
      } else if (result.completed) {
        const completed: RequestCompletedEvent = {
          requestId: result.requestId,
          companyName: result.companyName,
          contactName: result.contactName,
          contactEmail: result.contactEmail,
        };

        yield* events.emit(EVENTS.RequestCompleted, completed);
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

const rejectDocument = route(
  'POST',
  '/documents/:id/reject',
  handler(
    'POST',
    Effect.gen(function* () {
      const events = yield* Events;
      const { scope, accountantId } = yield* FirmContext;
      const { id } = yield* params(IdParam);
      const input = yield* body(RejectDocumentBody);

      const result = yield* RequestsRepo.use((repo) =>
        repo.rejectDocument(scope, id, input.rejectionReason, accountantId),
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

      yield* events.emit(EVENTS.ItemReopened, reopened);

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

      const result = yield* RequestsRepo.use((repo) =>
        repo.reviewExtraDocument(
          scope,
          id,
          { reviewStatus: input.decision, rejectionReason: input.rejectionReason },
          accountantId,
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

      const result = yield* RequestsRepo.use((repo) => repo.undoAcceptItem(scope, id));
      if (!result) return yield* Effect.fail(new NotFound('Item não encontrado.'));

      return result;
    }),
  ),
  { auth: firmRoute() },
);

/** A versão HTTP da varredura de prazos, restrita à Contabilidade do chamador (AUTHZ-2). */
const scanDeadlines = route(
  'POST',
  '/deadlines/scan',
  handler(
    'POST',
    Effect.gen(function* () {
      const { scope } = yield* FirmContext;

      return yield* DeadlineScan.use((deadlines) => deadlines.scan(scope));
    }),
  ),
  { auth: firmRoute() },
);

/** Revisão no painel do Contador (sessão + FirmScope). Recurso de outra Contabilidade
 *  responde 404: o join até `period` não o alcança e nada revela que ele existe. */
export const reviewRoutes = Layer.mergeAll(
  acceptItem,
  publishReview,
  rejectDocument,
  reviewExtra,
  undoAccept,
  scanDeadlines,
);
