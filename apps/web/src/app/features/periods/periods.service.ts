import { Service, inject } from '@angular/core';
import type {
  ChannelFailureResponse,
  MissingItemResponse,
  PanelRowResponse,
  PeriodDetailResponse,
  PeriodSummaryResponse,
} from '@competa/contracts';
import { Api, apiResource, pageResource } from '../../core/http/api';

export type Period = PeriodSummaryResponse;
export type PeriodDetail = PeriodDetailResponse;
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

@Service()
export class PeriodsService {
  private readonly api = inject(Api);

  list(params: () => { page: number; perPage: number }) {
    return pageResource<Period>(() => '/periods', params);
  }

  detail(id: () => string | undefined) {
    return apiResource<PeriodDetail>(() => {
      const value = id();
      return value ? `/periods/${value}` : undefined;
    });
  }

  pendingPanel(id: () => string | undefined) {
    return apiResource<PanelRow[]>(() => {
      const value = id();
      return value ? `/periods/${value}/pending-panel` : undefined;
    });
  }

  open(body: { referenceMonth: string; dueDate?: string }) {
    return this.api.post<PeriodOpening>('/periods', body);
  }

  closePeriod(id: string) {
    return this.api.post<PeriodClosing>(`/periods/${id}/close`);
  }

  runReminders() {
    return this.api.post<unknown>('/messages/reminders/run');
  }

  downloadPeriodZip(id: string, referenceMonth: string) {
    return this.api.download(`/periods/${id}/zip`, `competencia-${referenceMonth.slice(0, 7)}.zip`);
  }

  downloadRequestZip(requestId: string, filename: string) {
    return this.api.download(`/requests/${requestId}/zip`, filename);
  }
}
