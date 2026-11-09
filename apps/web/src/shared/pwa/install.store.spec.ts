import { describe, expect, it, vi } from 'vitest';
import {
  canInstallOf,
  showIosHintOf,
  useInstallStore,
  type BeforeInstallPromptEvent,
} from '@/shared/pwa/install.store';

const promptEvent = () =>
  ({
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  }) as unknown as BeforeInstallPromptEvent;

describe('install store', () => {
  it('canInstall é false em standalone mesmo com deferredPrompt', () => {
    expect(canInstallOf({ deferredPrompt: promptEvent(), isStandalone: true })).toBe(false);
    expect(canInstallOf({ deferredPrompt: promptEvent(), isStandalone: false })).toBe(true);
    expect(canInstallOf({ deferredPrompt: null, isStandalone: false })).toBe(false);
  });

  it('a dica do iOS só aparece fora do app instalado', () => {
    expect(showIosHintOf({ isIos: true, isStandalone: false })).toBe(true);
    expect(showIosHintOf({ isIos: true, isStandalone: true })).toBe(false);
  });

  it('beforeinstallprompt guarda o evento e promptInstall consome uma vez', async () => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'accepted' as const }),
    });

    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(useInstallStore.getState().deferredPrompt).toBe(event);

    await useInstallStore.getState().promptInstall();
    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(useInstallStore.getState().deferredPrompt).toBeNull();
  });

  it('appinstalled marca standalone', () => {
    window.dispatchEvent(new Event('appinstalled'));

    expect(useInstallStore.getState().isStandalone).toBe(true);
    useInstallStore.setState({ isStandalone: false });
  });
});
