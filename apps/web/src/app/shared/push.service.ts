import { Service, inject, signal } from '@angular/core';
import { Api } from '../core/http/api';
import { Toaster } from '../core/ui/toast';
import { apiErrorMessage } from '../core/http/api-error';

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

const bytesFromBase64 = (base64: string) => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');

  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const toBase64 = (buffer: ArrayBuffer | null) =>
  buffer ? btoa(String.fromCharCode(...new Uint8Array(buffer))) : '';

/** Web Push do Responsável, oferecido nos DOIS lugares: na tela de sucesso do envio (onde
 *  o `save` grava pelo token do Link, sem conta) e na área logada. Quem chama decide como
 *  a inscrição é persistida — a permissão do navegador e o service worker são iguais.
 *
 *  A chave pública VAPID vem da API (`GET /push/vapid-key`), não do bundle: ela só vale
 *  casada com a privada do servidor, e chave compilada envelhece sem ninguém notar. Sem
 *  chave (dev, ou produção sem VAPID configurado) `available()` fica falso e a UI não
 *  oferece o recurso. */
@Service()
export class PushService {
  private readonly api = inject(Api);
  private readonly toaster = inject(Toaster);

  private readonly supported =
    typeof Notification !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  private key = '';

  readonly available = signal(false);
  readonly subscribed = signal(false);
  readonly subscribing = signal(false);

  constructor() {
    if (this.supported) void this.loadKey();
  }

  /** Falha silenciosa de propósito: chave indisponível é "push desligado", não erro na
   *  cara de quem só queria enviar um documento. */
  private async loadKey() {
    try {
      const { key } = await this.api.get<{ key: string }>('/push/vapid-key');
      this.key = key;
      this.available.set(Boolean(key));
    } catch {
      this.available.set(false);
    }
  }

  async subscribe(save: (payload: PushSubscriptionPayload) => Promise<unknown>) {
    if (!this.available()) return;

    this.subscribing.set(true);

    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        this.toaster.info('As notificações ficaram bloqueadas neste aparelho.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytesFromBase64(this.key),
      });

      await save({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: toBase64(subscription.getKey('p256dh')),
          auth: toBase64(subscription.getKey('auth')),
        },
      });

      this.subscribed.set(true);
      this.toaster.success('Avisos ligados neste aparelho.');
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível ligar os avisos.'));
    } finally {
      this.subscribing.set(false);
    }
  }
}
