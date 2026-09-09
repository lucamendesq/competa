import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBellRing,
  lucideChevronDown,
  lucideCircleCheck,
  lucideFileArchive,
  lucideLock,
  lucideMail,
  lucideMailWarning,
  lucidePartyPopper,
  lucideSearch,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { Api } from '../../core/http/api';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { StatusPill } from '../../shared/status-pill';
import { DueDate } from '../../shared/due-date';
import { isOverdue, maskedCnpj, monthLabel, dateBr, slug } from '../../shared/format';
import { CompaniesService } from '../companies/companies.service';
import { RequestsService } from '../requests/requests.service';
import { PeriodsService, PanelRow } from './periods.service';

type Filter = 'all' | 'pending' | 'overdue' | 'complete' | 'closed';

@Component({
  selector: 'app-pending-panel-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    PageHeader,
    EmptyState,
    ErrorState,
    LoadingRows,
    Modal,
    StatusPill,
    DueDate,
  ],
  providers: [
    provideIcons({
      lucideBellRing,
      lucideChevronDown,
      lucideCircleCheck,
      lucideFileArchive,
      lucideLock,
      lucideMail,
      lucideMailWarning,
      lucidePartyPopper,
      lucideSearch,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './pending-panel-page.html',
})
export class PendingPanelPage {
  readonly periodId = input.required<string>();

  private readonly service = inject(PeriodsService);
  private readonly companies = inject(CompaniesService);
  private readonly requests = inject(RequestsService);
  private readonly api = inject(Api);
  private readonly toaster = inject(Toaster);

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;
  protected readonly maskedCnpj = maskedCnpj;
  protected readonly isOverdue = isOverdue;

  protected readonly period = this.service.detail(() => this.periodId());
  protected readonly panel = this.service.pendingPanel(() => this.periodId());

  private readonly portfolio = this.companies.list(() => ({ page: 1, perPage: 100 }));

  private readonly cnpjByCompany = computed(
    () => new Map(this.portfolio.value().data.map((row) => [row.id, row.cnpj])),
  );

  protected readonly search = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());

  protected readonly lines = computed(
    () =>
      this.panel.value()?.map((line) => {
        const total = Object.values(line.counts).reduce((soma, value) => soma + value, 0);
        const overdue = line.missing.filter((item) => isOverdue(item.dueDate));

        return {
          ...line,
          cnpj: this.cnpjByCompany().get(line.companyId) ?? null,
          total,
          percent: total ? Math.round((line.counts.accepted / total) * 100) : 0,
          overdue: overdue.length,
        };
      }) ?? [],
  );

  protected readonly counts = computed(() => {
    const lines = this.lines();

    return {
      all: lines.length,
      pending: lines.filter((line) => line.requestStatus === 'open' && line.missing.length).length,
      overdue: lines.filter((line) => line.overdue > 0).length,
      complete: lines.filter((line) => line.requestStatus === 'complete').length,
      closed: lines.filter((line) => line.requestStatus === 'closed').length,
    };
  });

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const filter = this.filter();

    return this.lines().filter((line) => {
      if (term && !line.companyName.toLowerCase().includes(term)) return false;
      if (filter === 'pending') return line.requestStatus === 'open' && line.missing.length > 0;
      if (filter === 'overdue') return line.overdue > 0;
      if (filter === 'complete') return line.requestStatus === 'complete';
      if (filter === 'closed') return line.requestStatus === 'closed';

      return true;
    });
  });

  protected readonly sendProgress = computed(() => {
    const lines = this.lines();
    const total = lines.reduce((soma, line) => soma + line.total, 0);
    const accepted = lines.reduce((soma, line) => soma + line.counts.accepted, 0);

    return { total, accepted, percent: total ? Math.round((accepted / total) * 100) : 0 };
  });

  protected readonly allDelivered = computed(
    () => this.lines().length > 0 && this.lines().every((line) => line.missing.length === 0),
  );

  protected readonly chips: { value: Filter; label: string }[] = [
    { value: 'all', label: 'Todas' },
    { value: 'pending', label: 'Com pendência' },
    { value: 'overdue', label: 'Atrasadas' },
    { value: 'complete', label: 'Completas' },
    { value: 'closed', label: 'Encerradas' },
  ];

  protected readonly confirmClose = signal(false);
  protected readonly closing = signal(false);

  protected toggle(companyId: string) {
    this.expanded.update((current) => {
      const next = new Set(current);
      if (!next.delete(companyId)) next.add(companyId);

      return next;
    });
  }

  protected isExpanded(companyId: string) {
    return this.expanded().has(companyId);
  }

  protected async downloadPeriodZip() {
    const reference = this.period.value()?.referenceMonth ?? '';

    try {
      await this.api.download(
        `/periods/${this.periodId()}/zip`,
        `competencia-${reference.slice(0, 7)}.zip`,
      );
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
    }
  }

  protected async downloadCompanyZip(requestId: string, companyName: string) {
    try {
      await this.api.download(`/requests/${requestId}/zip`, `${slug(companyName)}.zip`);
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
    }
  }

  protected readonly resendingRequestId = signal<string | null>(null);

  /** Reenvio de UMA empresa (o "Reenviar" antigo daqui disparava a varredura do tenant
   *  inteiro). Gera link novo — o anterior, que falhou no canal, deixa de valer. */
  protected async resendUploadLink(line: PanelRow) {
    this.resendingRequestId.set(line.requestId);

    try {
      const link = await this.requests.resendUploadLink(line.requestId);
      this.toaster.success(`Link de ${line.companyName} enviado para ${link.contactEmail}.`);
      this.panel.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível reenviar o link.'));
    } finally {
      this.resendingRequestId.set(null);
    }
  }

  protected async resendReminders() {
    try {
      await this.service.runReminders();
      this.toaster.success('Varredura de lembretes disparada.');
      this.panel.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível disparar os lembretes.'));
    }
  }

  protected async closePeriod() {
    this.closing.set(true);

    try {
      const closed = await this.service.closePeriod(this.periodId());
      this.toaster.success(closed.warning ?? 'Competência encerrada.');
      this.period.reload();
      this.panel.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível encerrar a competência.'));
    } finally {
      this.closing.set(false);
      this.confirmClose.set(false);
    }
  }

  protected uniqueFailures(line: PanelRow) {
    const labels: Record<string, string> = {
      email: 'e-mail',
      whatsapp: 'WhatsApp',
      push: 'push',
    };

    return [
      ...new Set(line.channelFailures.map((failure) => labels[failure.channel] ?? failure.channel)),
    ];
  }
}
