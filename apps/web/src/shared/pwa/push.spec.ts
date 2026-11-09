import { afterEach, describe, expect, it, vi } from 'vitest';
import { bytesFromBase64, serviceWorkerReady } from '@/shared/pwa/push';

afterEach(() => vi.useRealTimers());

describe('serviceWorkerReady', () => {
  it('sem service worker desiste em 10 s com erro', async () => {
    vi.useFakeTimers();
    const ready = serviceWorkerReady(new Promise<ServiceWorkerRegistration>(() => undefined));
    const outcome = ready.catch((error: Error) => error.message);

    await vi.advanceTimersByTimeAsync(9_999);
    let settled = false;
    void outcome.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await outcome).toBe('service worker indisponível');
  });

  it('com service worker pronto resolve com o registro', async () => {
    const registration = { scope: '/' } as ServiceWorkerRegistration;

    await expect(serviceWorkerReady(Promise.resolve(registration))).resolves.toBe(registration);
  });
});

describe('bytesFromBase64', () => {
  it('aceita base64url sem padding', () => {
    expect(Array.from(bytesFromBase64('AQID-_8'))).toEqual([1, 2, 3, 251, 255]);
  });
});
