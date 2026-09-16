import { Service, inject } from '@angular/core';
import { Api, apiResource, pageResource } from '../../core/http/api';

export type Period = {
  id: string;
  referenceMonth: string;
  status: 'open' | 'closed';
  dueDate: string | null;
  requestCount: number;
  createdAt: string;
};

export type PeriodDetail = Period & {
  completeRequestCount: number;
  pendingItemCount: number;
};

export type MissingItem = {
  id: string;
  name: string;
  status: 'pending' | 'submitted' | 'accepted' | 'rejected';
  dueDate: string | null;
  /** `submitted` com recusa no histórico: já reenviado, esperando nova conferência. */
  resent: boolean;
};

export type ChannelFailure = {
  requestId: string;
  channel: string;
  purpose: string;
  recipient: string;
  error: string | null;
  createdAt: string;
};

export type PanelRow = {
  companyId: string;
  companyName: string;
  requestId: string;
  requestStatus: 'open' | 'complete' | 'closed';
  counts: { pending: number; submitted: number; accepted: number; rejected: number };
  missing: MissingItem[];
  channelFailures: ChannelFailure[];
};

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
  warnings: { companyId: string; companyName: string; reason: string; blockedBy: 'contact' | 'template' }[];
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
}
