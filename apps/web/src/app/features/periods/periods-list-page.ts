import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { OpenPeriodBody } from '@competa/contracts';
import * as z from 'zod';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCalendarPlus,
  lucideCircleCheck,
  lucideClock,
  lucideCopy,
  lucideFileArchive,
  lucideLock,
  lucideTriangleAlert,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { EmptyState } from '../../shared/empty-state';
import { Callout } from '../../shared/callout';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { Pagination } from '../../shared/pagination';
import { StatusPill } from '../../shared/status-pill';
import {
  monthLabel,
  defaultReferenceMonth,
  dateBr,
  dateTimeBr,
  MONTH_OPTIONS,
} from '../../shared/format';
import { CompaniesService } from '../companies/companies.service';
import { PeriodOpening, PeriodsService, CreatedRequest } from './periods.service';

@Component({
  selector: 'app-periods-list-page',
  imports: [
    RouterLink,
    FormField,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmLabel,
    HlmTableImports,
    PageHeader,
    EmptyState,
    ErrorState,
    LoadingRows,
    Modal,
    Pagination,
    StatusPill,
    Callout,
  ],
  providers: [
    provideIcons({
      lucideArrowRight,
      lucideCalendarPlus,
      lucideCircleCheck,
      lucideClock,
      lucideCopy,
      lucideFileArchive,
      lucideLock,
      lucideTriangleAlert,
    }),
  ],
  templateUrl: './periods-list-page.html',
})
export class PeriodsListPage {
  private readonly service = inject(PeriodsService);
  private readonly companies = inject(CompaniesService);
  private readonly toaster = inject(Toaster);

  protected readonly monthLabel = monthLabel;
  protected readonly dateBr = dateBr;
  protected readonly dateTimeBr = dateTimeBr;

  protected readonly page = signal(1);
  protected readonly perPage = 20;
  protected readonly filter = signal<'todas' | 'open' | 'closed'>('todas');

  protected readonly chips = [
    { value: 'todas' as const, label: 'Todas' },
    { value: 'open' as const, label: 'Abertas' },
    { value: 'closed' as const, label: 'Encerradas' },
  ];

  protected readonly periods = this.service.list(() => ({
    page: this.page(),
    perPage: this.perPage,
  }));

  protected readonly current = computed(() =>
    [...this.periods.value().data]
      .filter((row) => row.status === 'open')
      .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))
      .at(0),
  );

  protected readonly currentDetail = this.service.detail(() => this.current()?.id);

  protected readonly visible = computed(() => {
    const rows = [...this.periods.value().data].sort((a, b) =>
      b.referenceMonth.localeCompare(a.referenceMonth),
    );
    const filter = this.filter();

    return filter === 'todas' ? rows : rows.filter((row) => row.status === filter);
  });

  protected readonly counts = computed(() => {
    const rows = this.periods.value().data;
    return {
      todas: rows.length,
      open: rows.filter((row) => row.status === 'open').length,
      closed: rows.filter((row) => row.status === 'closed').length,
    };
  });

  protected readonly modalOpen = signal(false);
  protected readonly result = signal<PeriodOpening | null>(null);
  protected readonly openError = signal<string | null>(null);

  protected readonly opening = signal<{ referenceMonth: string; dueDate: string }>({
    referenceMonth: defaultReferenceMonth(),
    dueDate: '',
  });

  /* Mês de referência em dois selects: `type="month"` não existe no Safari e degrada para
   * um campo de texto, onde o Contador tem de adivinhar que o formato é `2026-07`. */
  protected readonly months = MONTH_OPTIONS;
  protected readonly years = Array.from(
    { length: 4 },
    (_, index) => Number(defaultReferenceMonth().slice(0, 4)) - 2 + index,
  );

  protected readonly monthPart = computed(() => this.opening().referenceMonth.slice(5, 7));
  protected readonly yearPart = computed(() => Number(this.opening().referenceMonth.slice(0, 4)));

  protected setMonth(month: string) {
    this.opening.update((current) => ({
      ...current,
      referenceMonth: `${current.referenceMonth.slice(0, 4)}-${month}`,
    }));
  }

  protected setYear(year: string) {
    this.opening.update((current) => ({
      ...current,
      referenceMonth: `${year}-${current.referenceMonth.slice(5, 7)}`,
    }));
  }

  private readonly OpenPeriodForm = OpenPeriodBody.extend({
    dueDate: z.union([z.iso.date(), z.literal('')]),
  });

  protected readonly f = form(this.opening, (path) =>
    validateStandardSchema(path, this.OpenPeriodForm),
  );

  protected readonly active = this.companies.list(() => ({
    page: 1,
    perPage: 100,
    active: 'true',
  }));

  protected readonly preview = computed(() => {
    const rows = this.active.value().data;
    const withoutTemplate = rows.filter((row) => !row.checklistTemplateId);
    const recipients = rows.filter((row) => row.contactCount > 0 && row.checklistTemplateId);

    return {
      created: recipients.length,
      recipients,
      emailCount: recipients.length,
      withoutContact: rows.filter((row) => row.contactCount === 0 && row.checklistTemplateId),
      withoutTemplate,
    };
  });

  /** Abrir competência dispara N emails de uma vez, e isso não se desfaz: o passo de
   *  confirmação existe para o Contador ver empresa por empresa (e o email de cada
   *  Responsável) ANTES do disparo. */
  protected readonly step = signal<'form' | 'confirm'>('form');

  protected review() {
    this.openError.set(null);

    return submit(this.f, async () => {
      this.step.set('confirm');

      return undefined;
    });
  }

  protected openModal() {
    this.result.set(null);
    this.openError.set(null);
    this.step.set('form');
    this.opening.set({ referenceMonth: defaultReferenceMonth(), dueDate: '' });
    this.modalOpen.set(true);
  }

  protected openPeriod() {
    this.openError.set(null);

    return submit(this.f, async (formTree) => {
      const { referenceMonth, dueDate } = formTree().value();

      try {
        const created = await this.service.open({
          referenceMonth,
          dueDate: dueDate || undefined,
        });

        this.result.set(created);
        this.periods.reload();
        const sent = created.requests.length;
        this.toaster.success(
          sent === 1
            ? 'Competência aberta. 1 link enviado por e-mail.'
            : `Competência aberta. ${sent} links enviados por e-mail.`,
        );
      } catch (error) {
        this.openError.set(apiErrorMessage(error, 'Não foi possível abrir a competência.'));
      }

      return undefined;
    });
  }

  protected async copyLink(request: CreatedRequest) {
    try {
      await navigator.clipboard.writeText(request.uploadUrl);
      this.toaster.success(`Link de ${request.companyName} copiado.`);
    } catch {
      this.toaster.error('Não foi possível copiar o link.');
    }
  }

  protected closeResult() {
    this.modalOpen.set(false);
    this.result.set(null);
  }

  protected readonly closing = signal<string | null>(null);
  protected readonly confirmClose = signal<string | null>(null);

  protected async closePeriod(id: string) {
    this.closing.set(id);

    try {
      const closed = await this.service.closePeriod(id);
      this.toaster.success(closed.warning ?? 'Competência encerrada.');
      this.periods.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível encerrar a competência.'));
    } finally {
      this.closing.set(null);
      this.confirmClose.set(null);
    }
  }

  protected async downloadZip(id: string, referenceMonth: string) {
    try {
      await this.service.downloadPeriodZip(id, referenceMonth);
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
    }
  }
}
