import { Service, inject } from '@angular/core';
import type { CreateInviteBody } from '@contabilidade/contracts';
import { Api } from '../../core/http/api';

export type CreatedInvite = { id: string; email: string; url: string };

@Service()
export class SettingsService {
  private readonly api = inject(Api);

  invite(body: CreateInviteBody) {
    return this.api.post<CreatedInvite>('/invites', body);
  }

  runReminders() {
    return this.api.post<unknown>('/messages/reminders/run');
  }
}
