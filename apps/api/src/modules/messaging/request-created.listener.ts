import { Logger } from '../../lib/logger.js';
import * as Sentry from '@sentry/node';
import { Effect } from 'effect';
import { squashError } from '../../infra/database/error.js';
import type { RequestCreatedEvent } from '../../lib/events.js';
import { linkDeliveryEmail } from './email-body.js';
import { MessagesRepo } from './message.repo.js';

const logger = new Logger('RequestCreatedListener');

export const deliverUploadLink = (event: RequestCreatedEvent) =>
  Effect.gen(function* () {
    const messages = yield* MessagesRepo;

    yield* messages.deliver({
      requestId: event.requestId,
      purpose: 'link_delivery',
      recipient: event.contactEmail,
      ...linkDeliveryEmail(event),
    });
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.sync(() => {
        const error = squashError(cause);
        logger.error(`Falha ao entregar link da Solicitação ${event.requestId}`, error);
        Sentry.captureException(error);
      }),
    ),
  );
