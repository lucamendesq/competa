import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import env from '../../../config/env.js';

export type PushMessage = {
  title: string;
  body: string;
  url?: string;
  subscriptions: { endpoint: string; keys: Record<string, string> }[];
};

/** Web Push (PWA). Sem chaves VAPID configuradas, loga em vez de enviar — mesmo padrão do
 *  storage (D12) e do email: a fatia é demonstrável em dev sem credencial.
 *  Push nunca bloqueia o fluxo: falha por inscrição é registrada e o resto segue. */
@Injectable()
export class WebPush {
  private readonly logger = new Logger(WebPush.name);
  private readonly enabled = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

  constructor() {
    if (this.enabled) {
      webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
    }
  }

  async send(message: PushMessage) {
    if (message.subscriptions.length === 0) return { sent: 0, failed: 0, gone: [] as string[] };

    if (!this.enabled) {
      this.logger.log(
        `[sem VAPID] push "${message.title}" para ${message.subscriptions.length} inscrição(ões)`,
      );

      return { sent: message.subscriptions.length, failed: 0, gone: [] as string[] };
    }

    const payload = JSON.stringify({
      title: message.title,
      body: message.body,
      url: message.url,
    });

    let sent = 0;
    let failed = 0;
    /** Inscrições que o navegador descartou (404/410): não servem mais e devem sair. */
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
        else this.logger.error(`push falhou para ${subscription.endpoint}: ${String(error)}`);
        failed += 1;
      }
    }

    return { sent, failed, gone };
  }
}
