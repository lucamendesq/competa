import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import {
  COMPANY_FLAGS,
  PERIODICITIES,
  type CompanyFlag,
  type Periodicity,
} from '@contabilidade/contracts';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLock, lucidePlus, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
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
import type { CatalogDocument } from '../../shared/catalog-picker';

/** `added` distingue item que ainda não existe no banco (id temporário) do que só mudou. */
type DraftItem = TemplateItem & { added: boolean };

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
    HlmLabel,
    HlmTableImports,
    PageHeader,
    ErrorState,
    LoadingRows,
    Modal,
    CatalogPicker,
  ],
  providers: [provideIcons({ lucideLock, lucidePlus, lucideTrash2 })],
  templateUrl: './template-detail-page.html',
  host: { '(window:beforeunload)': 'onBeforeUnload($event)' },
})
export class TemplateDetailPage {
  readonly templateId = input.required<string>();

  private readonly service = inject(ChecklistsService);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);

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
  protected readonly confirmRemoval = signal<DraftItem | null>(null);

  private readonly catalog = this.service.documentTypes();

  protected readonly available = computed(() => {
    const alreadyInTemplate = new Set(this.visibleItems().map((item) => item.documentTypeId));
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

  /* --- Rascunho -------------------------------------------------------------------------
   * A tela salvava a cada tecla (um PATCH por `change` + `reload`), o que também era a
   * origem do piscar. Agora tudo acontece em memória e sai num "Salvar": o Contador vê o
   * template inteiro como vai ficar antes de mexer no que todas as empresas usam.
   * ponytail: o salvar aplica o diff em N chamadas (rename + add/patch/delete por item);
   * endpoint em lote só se isso doer. */
  protected readonly draftName = linkedSignal(() => this.template.value()?.name ?? '');
  protected readonly draftItems = linkedSignal<DraftItem[]>(() =>
    (this.template.value()?.items ?? []).map((item) => ({ ...item, added: false })),
  );
  protected readonly removedIds = linkedSignal<readonly string[]>(() => {
    this.template.value();

    return [];
  });

  private nextTempId = 0;

  protected readonly visibleItems = computed(() =>
    this.draftItems().filter((item) => !this.removedIds().includes(item.id)),
  );

  private readonly saved = computed(() => {
    const items = this.template.value()?.items ?? [];

    return new Map(items.map((item) => [item.id, item]));
  });

  protected isDirty(item: DraftItem) {
    const original = this.saved().get(item.id);
    if (!original) return true;

    return (
      original.periodicity !== item.periodicity ||
      original.annualMonth !== item.annualMonth ||
      original.dueDay !== item.dueDay ||
      original.dueMonthOffset !== item.dueMonthOffset ||
      original.conditionFlag !== item.conditionFlag ||
      original.required !== item.required
    );
  }

  protected readonly pendingCount = computed(() => {
    const renamed = this.draftName().trim() !== (this.template.value()?.name ?? '') ? 1 : 0;
    const touched = this.visibleItems().filter((item) => this.isDirty(item)).length;

    return renamed + touched + this.removedIds().length;
  });

  protected readonly hasChanges = computed(() => this.pendingCount() > 0);

  private patchItem(itemId: string, change: Partial<DraftItem>) {
    this.draftItems.update((items) =>
      items.map((item) => (item.id === itemId ? { ...item, ...change } : item)),
    );
  }

  protected changePeriodicity(item: DraftItem, value: string) {
    const periodicity = value as Periodicity;

    this.patchItem(item.id, {
      periodicity,
      annualMonth: periodicity === 'annual' ? (item.annualMonth ?? 1) : null,
    });
  }

  protected changeDay(item: DraftItem, value: string) {
    const dueDay = value === '' ? null : Number(value);
    if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return;

    this.patchItem(item.id, { dueDay });
  }

  protected changeAnnualMonth(item: DraftItem, value: string) {
    this.patchItem(item.id, { annualMonth: Number(value) });
  }

  protected changeCondition(item: DraftItem, value: string) {
    this.patchItem(item.id, { conditionFlag: value === '' ? null : (value as CompanyFlag) });
  }

  protected toggleRequired(item: DraftItem) {
    this.patchItem(item.id, { required: !item.required });
  }

  /** Item novo entra com id temporário: só o salvar troca por id do banco. */
  protected add(document: CatalogDocument) {
    this.draftItems.update((items) => [
      ...items,
      {
        id: `novo-${(this.nextTempId += 1)}`,
        documentTypeId: document.id,
        name: document.name,
        category: document.category as DraftItem['category'],
        description: null,
        acceptedFormats: document.acceptedFormats,
        periodicity: 'monthly',
        annualMonth: null,
        dueDay: null,
        dueMonthOffset: 1,
        conditionFlag: null,
        required: true,
        added: true,
      },
    ]);
    this.catalogOpen.set(false);
    this.toaster.success(`${document.name} entra no template quando você salvar.`);
  }

  protected remove(item: DraftItem) {
    if (item.added) {
      this.draftItems.update((items) => items.filter((row) => row.id !== item.id));
    } else {
      this.removedIds.update((ids) => [...ids, item.id]);
    }

    this.confirmRemoval.set(null);
  }

  protected discard() {
    this.draftName.set(this.template.value()?.name ?? '');
    this.draftItems.set(
      (this.template.value()?.items ?? []).map((item) => ({ ...item, added: false })),
    );
    this.removedIds.set([]);
  }

  protected async save() {
    if (!this.hasChanges()) return;

    this.acting.set(true);
    const templateId = this.templateId();

    try {
      const name = this.draftName().trim();
      if (name && name !== this.template.value()?.name) {
        await this.service.rename(templateId, name);
      }

      for (const itemId of this.removedIds()) {
        await this.service.removeItem(templateId, itemId);
      }

      for (const item of this.visibleItems()) {
        const scheduling = {
          periodicity: item.periodicity as Periodicity,
          annualMonth: item.annualMonth,
          dueDay: item.dueDay,
          dueMonthOffset: item.dueMonthOffset,
          conditionFlag: (item.conditionFlag ?? null) as CompanyFlag | null,
          required: item.required,
        };

        if (item.added) {
          await this.service.addItem(templateId, {
            documentTypeId: item.documentTypeId,
            ...scheduling,
          });
        } else if (this.isDirty(item)) {
          await this.service.updateItem(templateId, item.id, scheduling);
        }
      }

      this.toaster.success('Template salvo.');
      this.template.reload();
    } catch (error) {
      // recarrega para a tela refletir o que de fato foi gravado antes da falha
      this.toaster.error(apiErrorMessage(error, 'Não foi possível salvar o template.'));
      this.template.reload();
    } finally {
      this.acting.set(false);
    }
  }

  protected readonly confirmDelete = signal(false);

  protected async deleteTemplate() {
    this.acting.set(true);
    try {
      await this.service.deleteTemplate(this.templateId());
      this.toaster.success('Modelo excluído com sucesso.');
      this.confirmDelete.set(false);
      await this.router.navigate(['/checklists']);
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível excluir o modelo.'));
    } finally {
      this.acting.set(false);
    }
  }

  /* --- Saída com rascunho pendente ------------------------------------------------------ */
  private readonly leaveDecision = signal<((leave: boolean) => void) | null>(null);
  protected readonly confirmingLeave = computed(() => this.leaveDecision() !== null);

  confirmLeave(): boolean | Promise<boolean> {
    if (!this.hasChanges()) return true;

    return new Promise<boolean>((resolve) => this.leaveDecision.set(resolve));
  }

  protected resolveLeave(leave: boolean) {
    const decide = this.leaveDecision();
    this.leaveDecision.set(null);
    decide?.(leave);
  }

  protected onBeforeUnload(event: BeforeUnloadEvent) {
    if (this.hasChanges()) event.preventDefault();
  }
}
