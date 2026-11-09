import type { CheckoutBody } from '@competa/contracts';
import { api } from '@/shared/lib/api-client';
import type { CheckoutResult } from '@/features/billing/api/billing.types';

export const checkout = (body: CheckoutBody) => api.post<CheckoutResult>('/billing/checkout', body);
