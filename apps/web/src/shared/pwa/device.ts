import { api } from '@/shared/lib/api-client';
import { platformOf, useInstallStore } from '@/shared/pwa/install.store';

const DEVICE_ID_KEY = 'competa:device_id';
const DEVICE_PING_KEY = 'competa:device_pinged';

export const getDeviceId = () => {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
};

export const pingDeviceOnce = async () => {
  if (sessionStorage.getItem(DEVICE_PING_KEY)) return;
  sessionStorage.setItem(DEVICE_PING_KEY, '1');
  const { isIos, isStandalone } = useInstallStore.getState();
  try {
    await api.patch('/auth/device', {
      deviceId: getDeviceId(),
      platform: platformOf(isIos),
      installed: isStandalone,
    });
  } catch {
    sessionStorage.removeItem(DEVICE_PING_KEY);
  }
};
