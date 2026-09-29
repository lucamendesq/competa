import { ref, computed } from 'vue';
import type { DevicePlatform } from '@competa/contracts';
import { api } from '@/api/client';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DEVICE_ID_KEY = 'competa:device_id';
const DEVICE_PING_KEY = 'competa:device_pinged';

const detectIos = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

const detectPlatform = (isIos: boolean): DevicePlatform => {
  if (isIos) return 'ios';
  if (/Android/.test(navigator.userAgent)) return 'android';
  if (/Mobi/.test(navigator.userAgent)) return 'other';
  return 'desktop';
};

const deferredPrompt = ref<BeforeInstallPromptEvent | null>(null);
const isStandalone = ref(
  typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone)),
);
const isIos = ref(detectIos());
const platform = computed(() => detectPlatform(isIos.value));

const canInstall = computed(() => deferredPrompt.value !== null && !isStandalone.value);
const showIosHint = computed(() => isIos.value && !isStandalone.value);

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt.value = event as BeforeInstallPromptEvent;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt.value = null;
    isStandalone.value = true;
  });
}

export function usePwaInstall() {
  function getDeviceId(): string {
    if (typeof window === 'undefined') return '';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  async function pingOnce() {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(DEVICE_PING_KEY)) return;
    sessionStorage.setItem(DEVICE_PING_KEY, '1');

    try {
      await api.patch('/auth/device', {
        deviceId: getDeviceId(),
        platform: platform.value,
        installed: isStandalone.value,
      });
    } catch {
      sessionStorage.removeItem(DEVICE_PING_KEY);
    }
  }

  async function promptInstall() {
    const event = deferredPrompt.value;
    if (!event) return;

    deferredPrompt.value = null;
    await event.prompt();
    await event.userChoice;
  }

  return {
    isStandalone,
    isIos,
    platform,
    canInstall,
    showIosHint,
    getDeviceId,
    pingOnce,
    promptInstall,
  };
}
