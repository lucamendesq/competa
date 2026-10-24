import { Injectable } from '@nestjs/common';
import type { MessageListQuery } from '@competa/contracts';
import { run } from '../../effect/runtime.js';
import type { ContactScope, FirmScope, UploadScope } from '../auth/scope.js';
import { MessagesRepo, type Delivery, type MessagePurpose } from './message.repo.js';

export type { Delivery } from './message.repo.js';

/** Casca Nest sobre o serviço Effect (`message.repo.ts`): mantém a DI dos controllers, dos
 *  listeners de evento e do gancho de magic link até cada consumidor migrar; morre na fase
 *  final. Os provedores de canal (email/push/whatsapp) passaram para dentro do serviço
 *  Effect — ver `message.repo.ts`. */
@Injectable()
export class MessageRepository {
  savePushSubscription(
    scope: ContactScope | UploadScope,
    input: { endpoint: string; keys: Record<string, string> },
  ) {
    return run(MessagesRepo.use((repo) => repo.savePushSubscription(scope, input)));
  }

  deletePushSubscription(scope: ContactScope, endpoint: string) {
    return run(MessagesRepo.use((repo) => repo.deletePushSubscription(scope, endpoint)));
  }

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

  list(scope: FirmScope, query: MessageListQuery) {
    return run(MessagesRepo.use((repo) => repo.list(scope, query)));
  }

  resend(scope: FirmScope, messageId: string) {
    return run(MessagesRepo.use((repo) => repo.resend(scope, messageId)));
  }

  failuresByPeriod(scope: FirmScope, periodId: string) {
    return run(MessagesRepo.use((repo) => repo.failuresByPeriod(scope, periodId)));
  }

  reminderSettingsByFirm(firmIds: string[]) {
    return run(MessagesRepo.use((repo) => repo.reminderSettingsByFirm(firmIds)));
  }

  reminderCandidates(scope?: FirmScope) {
    return run(MessagesRepo.use((repo) => repo.reminderCandidates(scope)));
  }
}
