import * as z from 'zod';

export const DEVICE_PLATFORMS = ['ios', 'android', 'desktop', 'other'] as const;
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export const RegisterDeviceBody = z.object({
  deviceId: z.string().min(1, 'deviceId obrigatório.').max(100),
  platform: z.enum(DEVICE_PLATFORMS),
  installed: z.boolean().default(false),
});
export type RegisterDeviceBody = z.infer<typeof RegisterDeviceBody>;

export type AudienceDeviceStats = {
  total: number;
  installed: number;
  byPlatform: Record<DevicePlatform, { total: number; installed: number }>;
};

export type DeviceStatsResponse = {
  contacts: AudienceDeviceStats;
  accountants: AudienceDeviceStats;
};
