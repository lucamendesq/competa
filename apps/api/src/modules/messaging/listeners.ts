import type { Effect } from 'effect';
import type { EventEmitter2 } from '../../lib/event-emitter.js';
import { run, type AppContext } from '../../effect/runtime.js';
import { setMagicLinkSender, setResetPasswordSender } from '../../infra/auth/magic-link-sender.js';
import { EVENTS, type EventPayloads } from '../../lib/events.js';
import { Logger } from '../../lib/logger.js';
import * as collection from './collection-events.listener.js';
import { magicLinkEmail, resetPasswordEmail } from './email-body.js';
import { MessagesRepo } from './message.repo.js';
import { deliverUploadLink } from './request-created.listener.js';

const logger = new Logger('Event');

/* O `EventSubscribersLoader` do emissor de eventos do Nest embrulhava TODO handler neste
 * try/catch (`suppressErrors` default true): handler que lança vira linha de log e
 * `undefined` no array do `emitAsync`, nunca uma rejeição sem dono. O bug congelado #13
 * depende de o resultado do handler chegar ao emissor — por isso o `return`. */
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

const sendWithoutLog = (input: { recipient: string; subject: string; body: string }) =>
  run(MessagesRepo.use((repo) => repo.sendWithoutLog(input)));

/** O que o `MessagingModule` fazia no boot: registrar os dois listeners na MESMA
 *  `EventEmitter2` que as rotas usam e plugar os senders de magic link / reset de senha.
 *  A ordem de registro é a da lista `providers` do módulo — `RequestCreated` entrega o
 *  email antes de disparar o push. */
export const registerMessagingListeners = (events: EventEmitter2) => {
  const on = <Name extends keyof EventPayloads, E>(
    event: Name,
    handle: (payload: EventPayloads[Name]) => Effect.Effect<unknown, E, AppContext>,
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

  setMagicLinkSender(async ({ email, url }) => {
    await sendWithoutLog({ recipient: email, ...magicLinkEmail({ email, url }) });
  });
  setResetPasswordSender(async ({ email, url }) => {
    await sendWithoutLog({ recipient: email, ...resetPasswordEmail({ url }) });
  });
};
