import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import env from '../../../config/env.js';
import { reportChannelFailure } from '../../../lib/observability.js';
import { PushProvider, type PushMessage, type PushResult } from './push.provider.js';

export { PushProvider, type PushMessage, type PushResult };

@Injectable()
export class WebPushProvider extends PushProvider {
  private readonly logger = new Logger(WebPushProvider.name);

  constructor() {
    super();
    webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
  }

  async send(message: PushMessage): Promise<PushResult> {
    if (message.subscriptions.length === 0) return { sent: 0, failed: 0, gone: [] };

    const payload = JSON.stringify(notificationPayload(message));

    let sent = 0;
    let failed = 0;
    const gone: string[] = [];

    for (const subscription of message.subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: subscription.keys as never },
          payload,
        );
        sent += 1;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) gone.push(subscription.endpoint);
        else {
          this.logger.error(`push falhou para ${subscription.endpoint}: ${String(error)}`);
          reportChannelFailure('push', 'delivery', error);
        }
        failed += 1;
      }
    }

    return { sent, failed, gone };
  }
}

export { WebPushProvider as WebPush };

@Injectable()
export class ConsolePushProvider extends PushProvider {
  private readonly logger = new Logger(ConsolePushProvider.name);

  async send(message: PushMessage): Promise<PushResult> {
    if (message.subscriptions.length === 0) return { sent: 0, failed: 0, gone: [] };

    this.logger.log(
      `push "${message.title}" → ${message.body} (${message.url ?? 'sem url'}) para ${message.subscriptions.length} inscrição(ões)`,
    );

    return { sent: message.subscriptions.length, failed: 0, gone: [] };
  }
}

export const notificationPayload = (message: Pick<PushMessage, 'title' | 'body' | 'url'>) => ({
  notification: {
    title: message.title,
    body: message.body,
    icon: '/icons/app-icon-192.png',
    tag: 'coleta',
    renotify: true,
    data: message.url
      ? { onActionClick: { default: { operation: 'openWindow', url: message.url } } }
      : {},
  },
});
