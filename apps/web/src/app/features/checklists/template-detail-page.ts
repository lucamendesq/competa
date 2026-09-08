import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { COMPANY_FLAGS, PERIODICITIES, type Periodicity } from '@contabilidade/contracts';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { CATEGORY_LABEL, FLAG_LABEL, PERIODICITY_LABEL } from '../../shared/format';
import { CatalogPicker } from '../../shared/catalog-picker';
import { ChecklistsService, TemplateItem } from './checklists.service';

const MONTHS_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

@Component({
  selector: 'app-template-detail-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmTableImports,
    PageHeader,
    ErrorState,
    LoadingRows,
    Modal,
    CatalogPicker,
  ],
  providers: [provideIcons({ lucideLock, lucidePlus, lucideTrash2 })],
  templateUrl: './template-detail-page.html',
})
export class TemplateDetailPage {
  readonly templateId = input.required<string>();

  private readonly service = inject(ChecklistsService);
  private readonly toaster = inject(Toaster);

  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly PERIODICITY_LABEL = PERIODICITY_LABEL;
  protected readonly periodicities = PERIODICITIES;
  protected readonly months = MONTHS_PT;
  protected readonly flags = COMPANY_FLAGS.map((flag) => ({ key: flag, label: FLAG_LABEL[flag] }));

  protected readonly template = this.service.template(() => this.templateId());
  protected readonly editable = computed(() => this.template.value()?.accountingFirmId !== null);

  protected readonly acting = signal(false);
  protected readonly catalogOpen = signal(false);
  protected readonly catalogSearch = signal('');
  protected readonly confirmRemoval = signal<TemplateItem | null>(null);

  private readonly catalog = this.service.documentTypes();

  protected readonly available = computed(() => {
    const alreadyInTemplate = new Set(
      (this.template.value()?.items ?? []).map((item) => item.documentTypeId),
    );
    const term = this.catalogSearch().trim().toLowerCase();

    return (this.catalog.value().data ?? []).filter(
      (kind) =>
        !alreadyInTemplate.has(kind.id) && (!term || kind.name.toLowerCase().includes(term)),
    );
  });

  protected deliveryMonth(item: TemplateItem) {
    if (item.periodicity === 'annual') {
      return item.annualMonth ? MONTHS_PT[item.annualMonth - 1] : '—';
    }

    return item.dueMonthOffset === 0 ? 'Mês de referência' : `${item.dueMonthOffset}º mês seguinte`;
  }

  protected async update(item: TemplateItem, change: Partial<TemplateItem>) {
    this.acting.set(true);

    try {
      /* Mescla por presença da chave, não por `??`: mandar `annualMonth: null` tem de
       * apagar o mês, e `??` o restauraria silenciosamente. */
      const current = { ...item, ...change };

      await this.service.updateItem(this.templateId(), item.id, {
        periodicity: current.periodicity as Periodicity,
        annualMonth: current.annualMonth,
        dueDay: current.dueDay,
        dueMonthOffset: current.dueMonthOffset,
        conditionFlag: current.conditionFlag,
        required: current.required,
      });

      this.template.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível salvar o item.'));
    } finally {
      this.acting.set(false);
    }
  }

  protected changePeriodicity(item: TemplateItem, value: string) {
    const periodicity = value as Periodicity;

    return this.update(item, {
      periodicity,
      annualMonth: periodicity === 'annual' ? (item.annualMonth ?? 1) : null,
    });
  }

  protected changeDay(item: TemplateItem, value: string) {
    const dueDay = value === '' ? null : Number(value);
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return;

    return this.update(item, { dueDay });
  }

  protected changeCondition(item: TemplateItem, value: string) {
    return this.update(item, { conditionFlag: value === '' ? null : value });
  }

  protected async add(documentTypeId: string, nome: string) {
    this.acting.set(true);

    try {
      await this.service.addItem(this.templateId(), {
        documentTypeId,
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      });

      this.toaster.success(`${nome} adicionado ao template.`);
      this.template.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível adicionar o item.'));
    } finally {
      this.acting.set(false);
    }
  }

  protected async remover(item: TemplateItem) {
    this.acting.set(true);

    try {
      await this.service.removerItem(this.templateId(), item.id);
      this.toaster.success(`${item.name} removido do template.`);
      this.template.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível remover o item.'));
    } finally {
      this.acting.set(false);
      this.confirmRemoval.set(null);
    }
  }
}
