import { api } from '@/api/client';
import type {
  ChannelFailureResponse,
  MissingItemResponse,
  PanelRowResponse,
  PeriodDetailResponse,
  PeriodSummaryResponse,
} from '@competa/contracts';

export type Period = PeriodSummaryResponse;
export type PeriodDetail = PeriodDetailResponse & { deliveredCount: number; requestCount: number };
export type MissingItem = MissingItemResponse;
export type ChannelFailure = ChannelFailureResponse;
export type PanelRow = PanelRowResponse;

export type CreatedRequest = {
  id: string;
  companyId: string;
  companyName: string;
  itemCount: number;
  uploadUrl: string;
};

export type PeriodOpening = {
  id: string;
  referenceMonth: string;
  status: string;
  dueDate: string | null;
  warnings: {
    companyId: string;
    companyName: string;
    reason: string;
    blockedBy: 'contact' | 'template';
  }[];
  requests: CreatedRequest[];
};

export type PeriodClosing = {
  id: string;
  referenceMonth: string;
  status: string;
  closedRequestCount: number;
  pendingItemCount: number;
  warning: string | null;
};

export const getPeriodsList = (params: { page: number; perPage: number }) =>
  api.page<Period>('/periods', params);

export const getPeriodDetail = (id: string) => api.get<PeriodDetail>(`/periods/${id}`);

export const getPendingPanel = (id: string) => api.get<PanelRow[]>(`/periods/${id}/pending-panel`);

export const openPeriod = (body: { referenceMonth: string; dueDate?: string }) =>
  api.post<PeriodOpening>('/periods', body);

/** Fan-out tardio: Empresas ativas que ainda não têm Solicitação nesta Competência. */
export const addMissingRequests = (id: string) =>
  api.post<Pick<PeriodOpening, 'warnings' | 'requests'>>(`/periods/${id}/requests`);

export type PeriodPreview = {
  requests: { companyId: string; companyName: string; contactName: string; itemCount: number }[];
  skipped: PeriodOpening['warnings'];
  notes: PeriodOpening['warnings'];
};

/** O que abrir `referenceMonth` criaria, sem gravar: o mesmo fan-out da abertura. */
export const getPeriodPreview = (referenceMonth: string) =>
  api.get<PeriodPreview>(`/periods/preview?referenceMonth=${encodeURIComponent(referenceMonth)}`);

export const closePeriod = (id: string) => api.post<PeriodClosing>(`/periods/${id}/close`);

/** `busy`: outra varredura (o cron ou outro clique) já está cobrando esta Contabilidade. */
export const runReminders = () =>
  api.post<{ scanned: number; sent: number; busy: boolean }>('/messages/reminders/run');

export const downloadPeriodZip = (id: string, referenceMonth: string) =>
  api.download(`/periods/${id}/zip`, `competencia-${referenceMonth.slice(0, 7)}.zip`);

export const downloadRequestZip = (requestId: string, filename: string) =>
  api.download(`/requests/${requestId}/zip`, filename);
