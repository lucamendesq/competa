export type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export const SERVICE_WORKER_TIMEOUT_MS = 10_000;

export const pushSupported = () =>
  typeof Notification !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  typeof window !== 'undefined' &&
  'PushManager' in window;

export const bytesFromBase64 = (base64: string) => {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
};

const toBase64 = (buffer: ArrayBuffer | null) =>
  buffer ? btoa(String.fromCharCode(...new Uint8Array(buffer))) : '';

// Sem service worker registrado o `ready` nunca resolve: o prazo evita "Ativando…" eterno.
export const serviceWorkerReady = (ready: Promise<ServiceWorkerRegistration>) =>
  Promise.race([
    ready,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('service worker indisponível')), SERVICE_WORKER_TIMEOUT_MS),
    ),
  ]);

export const payloadOf = (subscription: PushSubscription): PushSubscriptionPayload => ({
  endpoint: subscription.endpoint,
  keys: {
    p256dh: toBase64(subscription.getKey('p256dh')),
    auth: toBase64(subscription.getKey('auth')),
  },
});
