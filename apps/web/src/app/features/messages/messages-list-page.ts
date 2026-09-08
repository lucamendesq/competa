import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MESSAGE_STATUS } from '@contabilidade/contracts';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBellRing,
  lucideMail,
  lucideMessageSquare,
  lucideSmartphone,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { PageHeader } from '../../shared/page-header';
import { Pagination } from '../../shared/pagination';
import { StatusPill } from '../../shared/status-pill';
import { monthLabel, dateTimeBr } from '../../shared/format';
import { PeriodsService } from '../periods/periods.service';
import {
  CHANNEL_LABEL,
  Message,
  MessagesService,
  PURPOSE_LABEL,
  STATUS_LABEL,
} from './messages.service';

@Component({
  selector: 'app-messages-list-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmTableImports,
    PageHeader,
    EmptyState,
    ErrorState,
    LoadingRows,
    Pagination,
    StatusPill,
  ],
  providers: [
    provideIcons({
      lucideBellRing,
      lucideMail,
      lucideMessageSquare,
      lucideSmartphone,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './messages-list-page.html',
})
export class MessagesListPage {
  private readonly service = inject(MessagesService);
  private readonly periodsService = inject(PeriodsService);
  private readonly toaster = inject(Toaster);

  protected readonly PURPOSE_LABEL = PURPOSE_LABEL;
  protected readonly CHANNEL_LABEL = CHANNEL_LABEL;
  protected readonly STATUS_LABEL = STATUS_LABEL;
  protected readonly monthLabel = monthLabel;
  protected readonly dateTimeBr = dateTimeBr;
  protected readonly availableStatuses = MESSAGE_STATUS;

  protected readonly page = signal(1);
  protected readonly perPage = 20;
  protected readonly periodId = signal('');
  protected readonly status = signal('');
  protected readonly channel = signal('');

  protected readonly periodOptions = this.periodsService.list(() => ({ page: 1, perPage: 100 }));

  protected readonly messages = this.service.list(() => ({
    page: this.page(),
    perPage: this.perPage,
    periodId: this.periodId() || undefined,
    status: this.status() || undefined,
  }));

  protected readonly visible = computed(() =>
    this.messages
      .value()
      .data.filter((message) => !this.channel() || message.channel === this.channel()),
  );

  protected readonly failures = computed(
    () => this.messages.value().data.filter((message) => message.status === 'failed').length,
  );

  protected readonly selected = signal<Message | null>(null);

  protected channelIcon(channel: string) {
    if (channel === 'whatsapp') return 'lucideMessageSquare';
    if (channel === 'push') return 'lucideSmartphone';

    return 'lucideMail';
  }

  protected async resendReminders() {
    try {
      await this.service.runReminders();
      this.toaster.success('Varredura de lembretes disparada.');
      this.messages.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível disparar os lembretes.'));
    }
  }
}
