import { ref } from 'vue';
import { api } from '@/api/client';
import { apiErrorMessage } from '@/api/error';
import { toast } from 'vue-sonner';

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

const supported =
  typeof Notification !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export function usePush() {
  const available = ref(false);
  const subscribed = ref(false);
  const subscribing = ref(false);
  let key = '';

  async function checkSubscription() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    subscribed.value = subscription !== null;
  }

  async function loadKey() {
    try {
      const res = await api.get<{ key: string }>('/push/vapid-key');
      key = res.key;
      available.value = Boolean(key);
    } catch {
      available.value = false;
    }
  }

  if (supported) {
    void loadKey();
    void checkSubscription();
  }

  async function subscribe(save: (payload: PushSubscriptionPayload) => Promise<unknown>) {
    if (!available.value) return;

    subscribing.value = true;

    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        toast.info('As notificações ficaram bloqueadas neste aparelho.');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytesFromBase64(key),
      });

      await save({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: toBase64(subscription.getKey('p256dh')),
          auth: toBase64(subscription.getKey('auth')),
        },
      });

      subscribed.value = true;
      toast.success('Avisos ligados neste aparelho.');
    } catch (error) {
      toast.error(apiErrorMessage(error, 'Não foi possível ligar os avisos.'));
    } finally {
      subscribing.value = false;
    }
  }

  return {
    available,
    subscribed,
    subscribing,
    subscribe,
  };
}
