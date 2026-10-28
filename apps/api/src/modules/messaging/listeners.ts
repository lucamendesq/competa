import type { Effect } from 'effect';
import type { RepoContext } from '../../effect/runtime.js';
import { setMagicLinkSender, setResetPasswordSender } from '../../infra/auth/magic-link-sender.js';
import type { EventEmitter2 } from '../../lib/event-emitter.js';
import { EVENTS, type EventPayloads } from '../../lib/events.js';
import { Events, type RunListener } from '../../lib/events.service.js';
import { Logger } from '../../lib/logger.js';
import * as collection from './collection-events.listener.js';
import { magicLinkEmail, resetPasswordEmail } from './email-body.js';
import { MessagesRepo } from './message.repo.js';
import { deliverUploadLink } from './request-created.listener.js';

const logger = new Logger('Event');

type ListenerContext = RepoContext;

/* Handler que lança vira linha de log e `undefined` no array do `emitAsync`, nunca uma
 * rejeição sem dono. O resultado do handler chega ao emissor — é assim que o reenvio de
 * link escolhe entre 200 e 503 — por isso o `return`. */
const guard =
  <Name extends keyof EventPayloads>(handle: (event: EventPayloads[Name]) => Promise<unknown>) =>
  async (event: EventPayloads[Name]): Promise<unknown> => {
    try {
      return await handle(event);
    } catch (error) {
      const failure = error as Error;
      logger.error(failure.message, failure.stack);
      return undefined;
    }
  };

/** A ordem de registro importa: `RequestCreated` entrega o email antes de disparar o push. */
const registerMessagingListeners = (events: EventEmitter2, run: RunListener<ListenerContext>) => {
  const on = <Name extends keyof EventPayloads, E>(
    event: Name,
    handle: (payload: EventPayloads[Name]) => Effect.Effect<unknown, E, ListenerContext>,
  ) =>
    events.on(
      event,
      guard<Name>((payload) => run(handle(payload))),
    );

  on(EVENTS.RequestCreated, (event) => deliverUploadLink(event));

  on(EVENTS.AccessRecoveryRequested, (event) => collection.onAccessRecoveryRequested(event));
  on(EVENTS.InviteCreated, (event) => collection.onInviteCreated(event));
  on(EVENTS.ContactInvited, (event) => collection.onContactInvited(event));
  on(EVENTS.UploadLinkResent, (event) => collection.onUploadLinkResent(event));
  on(EVENTS.RequestCreated, (event) => collection.onRequestCreated(event));
  on(EVENTS.ItemReopened, (event) => collection.onItemReopened(event));
  on(EVENTS.ReviewPublished, (event) => collection.onReviewPublished(event));
  on(EVENTS.RequestCompleted, (event) => collection.onRequestCompleted(event));
  on(EVENTS.DeadlineMissed, (event) => collection.onDeadlineMissed(event));
  on(EVENTS.ReminderDue, (event) => collection.onReminderDue(event));

  const sendWithoutLog = (input: { recipient: string; subject: string; body: string }) =>
    run(MessagesRepo.use((repo) => repo.sendWithoutLog(input)));

  setMagicLinkSender(async ({ email, url }) => {
    await sendWithoutLog({ recipient: email, ...magicLinkEmail({ email, url }) });
  });
  setResetPasswordSender(async ({ email, url }) => {
    await sendWithoutLog({ recipient: email, ...resetPasswordEmail({ url }) });
  });
};

/** O barramento do app com os listeners de messaging, rodando nas fibras dele. */
export const EventsLive = Events.make(registerMessagingListeners);
