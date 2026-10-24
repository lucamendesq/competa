import { run } from '../../effect/runtime.js';
import { MessagesRepo, type Delivery, type MessagePurpose } from './message.repo.js';

export type { Delivery } from './message.repo.js';

/** Fachada em Promise sobre o serviço Effect (`message.repo.ts`), para os dois listeners de
 *  evento e para o gancho de magic link — que vivem fora de um Effect. Só os métodos que
 *  eles chamam: o resto das rotas fala com o `MessagesRepo` direto. */
export class MessageRepository {
  deletePushSubscriptionByEndpoint(endpoint: string) {
    return run(MessagesRepo.use((repo) => repo.deletePushSubscriptionByEndpoint(endpoint)));
  }

  subscriptionsForRequest(requestId: string) {
    return run(MessagesRepo.use((repo) => repo.subscriptionsForRequest(requestId)));
  }

  sendWithoutLog(input: {
    requestId?: string;
    purpose?: string;
    recipient: string;
    subject: string;
    body: string;
    senderName?: string;
  }) {
    return run(MessagesRepo.use((repo) => repo.sendWithoutLog(input)));
  }

  deliverPush<T extends { sent: number; failed: number; gone: string[] }>(
    requestId: string,
    purpose: MessagePurpose,
    recipient: string,
    send: () => Promise<T>,
  ) {
    return run(MessagesRepo.use((repo) => repo.deliverPush(requestId, purpose, recipient, send)));
  }

  deliver(delivery: Delivery) {
    return run(MessagesRepo.use((repo) => repo.deliver(delivery)));
  }
}
