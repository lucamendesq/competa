import { Injectable, Logger } from '@nestjs/common';
import webpush from 'web-push';
import env from '../../../config/env.js';

export type PushMessage = {
  title: string;
  body: string;
  url?: string;
  subscriptions: { endpoint: string; keys: Record<string, string> }[];
};

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
      /* Em produção, "não habilitado" só acontece quando faltam as chaves VAPID — e aí
       * nada foi entregue. Contar como enviado marcaria a linha em `message` como `sent`,
       * e o Contador só descobriria pelo Responsável jurando que não recebeu. */
      if (env.NODE_ENV === 'production') {
        this.logger.error('push não enviado: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY ausentes.');

        return { sent: 0, failed: message.subscriptions.length, gone: [] as string[] };
      }

      this.logger.log(
        `push "${message.title}" → ${message.body} (${message.url ?? 'sem url'}) para ${message.subscriptions.length} inscrição(ões)`,
      );

      return { sent: message.subscriptions.length, failed: 0, gone: [] as string[] };
    }

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
        else this.logger.error(`push falhou para ${subscription.endpoint}: ${String(error)}`);
        failed += 1;
      }
    }

    return { sent, failed, gone };
  }
}

/** Formato do `@angular/service-worker`, não um objeto qualquer: o `ngsw-worker.js`
 *  descarta em silêncio todo push sem `notification.title` — o envio "dá certo", a linha
 *  em `message` vira `sent` e nada aparece na tela do Responsável.
 *  `data.onActionClick.default` é como o mesmo worker abre o link no clique. */
export const notificationPayload = (message: Pick<PushMessage, 'title' | 'body' | 'url'>) => ({
  notification: {
    title: message.title,
    body: message.body,
    icon: '/icons/app-icon-192.png',
    // um push novo do mesmo tipo substitui o anterior em vez de empilhar na bandeja
    tag: 'coleta',
    renotify: true,
    data: message.url
      ? { onActionClick: { default: { operation: 'openWindow', url: message.url } } }
      : {},
  },
});
