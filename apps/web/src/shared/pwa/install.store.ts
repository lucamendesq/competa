import type { DevicePlatform } from '@competa/contracts';
import { create } from 'zustand';

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type InstallState = {
  deferredPrompt: BeforeInstallPromptEvent | null;
  isStandalone: boolean;
  isIos: boolean;
  promptInstall: () => Promise<void>;
};

export const detectIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

export const detectStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches === true ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone));

export const platformOf = (isIos: boolean): DevicePlatform => {
  if (isIos) return 'ios';
  if (/Android/.test(navigator.userAgent)) return 'android';
  if (/Mobi/.test(navigator.userAgent)) return 'other';
  return 'desktop';
};

export const useInstallStore = create<InstallState>()((set, get) => ({
  deferredPrompt: null,
  isStandalone: detectStandalone(),
  isIos: detectIos(),
  promptInstall: async () => {
    const event = get().deferredPrompt;
    if (!event) return;
    set({ deferredPrompt: null });
    await event.prompt();
    await event.userChoice;
  },
}));

export const canInstallOf = (state: Pick<InstallState, 'deferredPrompt' | 'isStandalone'>) =>
  state.deferredPrompt !== null && !state.isStandalone;

export const showIosHintOf = (state: Pick<InstallState, 'isIos' | 'isStandalone'>) =>
  state.isIos && !state.isStandalone;

export const useCanInstall = () => useInstallStore(canInstallOf);
export const useShowIosHint = () => useInstallStore(showIosHintOf);
export const usePlatform = () => useInstallStore((state) => platformOf(state.isIos));

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    useInstallStore.setState({ deferredPrompt: event as BeforeInstallPromptEvent });
  });
  window.addEventListener('appinstalled', () => {
    useInstallStore.setState({ deferredPrompt: null, isStandalone: true });
  });
}
