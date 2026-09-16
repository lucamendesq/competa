import { Service, inject } from '@angular/core';
import type {
  CreateInviteBody,
  DeviceStatsResponse,
  UpdateFirmBody,
} from '@contabilidade/contracts';
import { Api, apiResource } from '../../core/http/api';

export type CreatedInvite = { id: string; email: string; url: string };
export type TeamAccountant = {
  id: string;
  name: string;
  email: string;
  owner: boolean;
  createdAt: string;
};
export type PendingInvite = { id: string; email: string; expiresAt: string };
export type FirmSettings = {
  id: string;
  name: string;
  reminderMax: number;
  reminderDueSoonDays: number;
  reminderGapDays: number;
};

@Service()
export class SettingsService {
  private readonly api = inject(Api);

  invite(body: CreateInviteBody) {
    return this.api.post<CreatedInvite>('/invites', body);
  }

  accountants() {
    return apiResource<TeamAccountant[]>(() => '/accountants');
  }

  removeAccountant(id: string) {
    return this.api.delete<{ removed: true }>(`/accountants/${id}`);
  }

  pendingInvites() {
    return apiResource<PendingInvite[]>(() => '/invites');
  }

  revokeInvite(id: string) {
    return this.api.delete<{ revoked: true }>(`/invites/${id}`);
  }

  firm() {
    return apiResource<FirmSettings>(() => '/accounting-firm');
  }

  updateFirm(body: UpdateFirmBody) {
    return this.api.patch<FirmSettings>('/accounting-firm', body);
  }

  runReminders() {
    return this.api.post<unknown>('/messages/reminders/run');
  }

  deviceStats() {
    return apiResource<DeviceStatsResponse>(() => '/accounting-firm/device-stats');
  }
}
