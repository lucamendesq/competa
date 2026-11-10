import { api } from '@/shared/lib/api-client';

export const downloadPeriodZip = (id: string, referenceMonth: string) =>
  api.download(`/periods/${id}/zip`, `competencia-${referenceMonth.slice(0, 7)}.zip`);

export const downloadRequestZip = (requestId: string, filename: string) =>
  api.download(`/requests/${requestId}/zip`, filename);
