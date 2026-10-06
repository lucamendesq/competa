import { api } from '@/api/client';
import type { UpdateFirmBody } from '@competa/contracts';

export type Firm = {
  id: string;
  name: string;
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
  logoUrl: string | null;
  contactEmail: string | null;
};

export const getFirm = () => api.get<Firm>('/accounting-firm');

export const updateFirm = (body: UpdateFirmBody) => api.patch<Firm>('/accounting-firm', body);
