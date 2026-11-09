import type { UpdateFirmBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { Firm } from '@/features/firm/api/firm.types';

export const updateFirm = (body: UpdateFirmBody) => api.patch<Firm>('/accounting-firm', body);
