import { Service, computed, inject, signal } from '@angular/core';
import type { DevicePlatform } from '@competa/contracts';
import { Api } from '../core/http/api';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

const DEVICE_ID_KEY = 'competa:device_id';
const DEVICE_PING_KEY = 'competa:device_pinged';

const detectIos = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const detectPlatform = (isIos: boolean): DevicePlatform => {
  if (isIos) return 'ios';
  if (/Android/.test(navigator.userAgent)) return 'android';
  if (/Mobi/.test(navigator.userAgent)) return 'other';
  return 'desktop';
};

@Service()
export class InstallService {
  private readonly api = inject(Api);
  private readonly deferredPrompt = signal<BeforeInstallPromptEvent | null>(null);

  readonly isStandalone = signal(
    typeof window !== 'undefined' &&
      (window.matchMedia?.('(display-mode: standalone)').matches ||
        (navigator as { standalone?: boolean }).standalone === true),
  );

  readonly isIos = signal(typeof navigator !== 'undefined' && detectIos());
  readonly platform = computed(() => detectPlatform(this.isIos()));

  readonly canInstall = computed(() => this.deferredPrompt() !== null && !this.isStandalone());
  readonly showIosHint = computed(() => this.isIos() && !this.isStandalone());

  constructor() {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.deferredPrompt.set(event as BeforeInstallPromptEvent);
    });

    window.addEventListener('appinstalled', () => {
      this.deferredPrompt.set(null);
      this.isStandalone.set(true);
    });
  }

  getDeviceId(): string {
    if (typeof window === 'undefined') return '';
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  async pingOnce() {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem(DEVICE_PING_KEY)) return;
    sessionStorage.setItem(DEVICE_PING_KEY, '1');

    try {
      await this.api.patch('/auth/device', {
        deviceId: this.getDeviceId(),
        platform: this.platform(),
        installed: this.isStandalone(),
      });
    } catch {
      sessionStorage.removeItem(DEVICE_PING_KEY);
    }
  }

  async promptInstall() {
    const event = this.deferredPrompt();
    if (!event) return;

    this.deferredPrompt.set(null);
    await event.prompt();
    await event.userChoice;
  }
}
