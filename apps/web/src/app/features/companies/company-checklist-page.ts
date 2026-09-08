import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucidePlus, lucideRotateCcw } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { CATEGORY_LABEL, PERIODICITY_LABEL } from '../../shared/format';
import { CatalogPicker } from '../../shared/catalog-picker';
import { ChecklistsService } from '../checklists/checklists.service';
import { CompaniesService } from './companies.service';
import { StatusPill } from '../../shared/status-pill';

type DisplayRow = {
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: string;
  dueDay: number | null;
  included: boolean;
  source: 'template' | 'adicionado' | 'removido';
  applicable: boolean;
  conditionFlag: string | null;
};

@Component({
  selector: 'app-company-checklist-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    PageHeader,
    ErrorState,
    LoadingRows,
    Modal,
    StatusPill,
    CatalogPicker,
  ],
  providers: [provideIcons({ lucidePlus, lucideRotateCcw })],
  templateUrl: './company-checklist-page.html',
})
export class CompanyChecklistPage {
  readonly companyId = input.required<string>();
  /** `?created=1` vem do cadastro: a tela vira "próximo passo" em vez de ajuste avulso. */
  readonly created = input(false, {
    transform: (value: string | boolean) => value === '1' || value === true,
  });

  private readonly service = inject(CompaniesService);
  private readonly checklists = inject(ChecklistsService);
  private readonly toaster = inject(Toaster);

  protected readonly CATEGORY_LABEL = CATEGORY_LABEL;
  protected readonly PERIODICITY_LABEL = PERIODICITY_LABEL;

  protected readonly company = this.service.detail(() => this.companyId());
  protected readonly checklist = this.service.effectiveChecklist(() => this.companyId());
  protected readonly overrides = this.service.overrides(() => this.companyId());

  protected readonly catalogOpen = signal(false);
  protected readonly catalogSearch = signal('');
  protected readonly acting = signal(false);
  protected readonly confirmRestore = signal(false);

  private readonly catalog = this.checklists.documentTypes();

  protected readonly lines = computed<DisplayRow[]>(() => {
    const effective = this.checklist.value()?.items ?? [];
    const removed = (this.overrides.value() ?? []).filter(
      (override) => override.action === 'remove',
    );

    const fromEffective: DisplayRow[] = effective.map((item) => ({
      documentTypeId: item.documentTypeId,
      name: item.name,
      category: item.category,
      description: item.description,
      acceptedFormats: item.acceptedFormats,
      periodicity: item.periodicity,
      dueDay: item.dueDay,
      included: true,
      source: item.source === 'override' ? 'adicionado' : 'template',
      applicable: item.applies,
      conditionFlag: item.conditionFlag,
    }));

    const fromRemoved: DisplayRow[] = removed.map((override) => ({
      documentTypeId: override.documentTypeId,
      name: override.name,
      category: override.category,
      description: override.description,
      acceptedFormats: override.acceptedFormats,
      periodicity: override.periodicity ?? 'monthly',
      dueDay: override.dueDay,
      included: false,
      source: 'removido',
      applicable: true,
      conditionFlag: override.conditionFlag,
    }));

    return [...fromEffective, ...fromRemoved].sort(
      (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
    );
  });

  protected readonly groups = computed(() => {
    const byCategory = new Map<string, DisplayRow[]>();

    for (const line of this.lines()) {
      byCategory.set(line.category, [...(byCategory.get(line.category) ?? []), line]);
    }

    return [...byCategory.entries()];
  });

  protected readonly custom = computed(() => (this.overrides.value() ?? []).length > 0);

  protected readonly available = computed(() => {
    const alreadyInChecklist = new Set(this.lines().map((line) => line.documentTypeId));
    const term = this.catalogSearch().trim().toLowerCase();

    return (this.catalog.value().data ?? []).filter(
      (kind) =>
        !alreadyInChecklist.has(kind.id) && (!term || kind.name.toLowerCase().includes(term)),
    );
  });

  protected async toggle(line: DisplayRow) {
    this.acting.set(true);

    try {
      if (line.source === 'template') {
        await this.service.saveOverride(this.companyId(), {
          documentTypeId: line.documentTypeId,
          action: 'remove',
          periodicity: 'monthly',
          dueMonthOffset: 1,
          required: true,
        });
        this.toaster.success(`${line.name} saiu do checklist desta empresa.`);
      } else {
        await this.service.removerOverride(this.companyId(), line.documentTypeId);
        this.toaster.success(
          line.source === 'removido'
            ? `${line.name} voltou para o checklist.`
            : `${line.name} foi removido do checklist.`,
        );
      }

      this.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível alterar o checklist.'));
    } finally {
      this.acting.set(false);
    }
  }

  protected async add(documentTypeId: string, nome: string) {
    this.acting.set(true);

    try {
      await this.service.saveOverride(this.companyId(), {
        documentTypeId,
        action: 'add',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      });

      this.toaster.success(`${nome} adicionado ao checklist.`);
      this.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível adicionar o documento.'));
    } finally {
      this.acting.set(false);
    }
  }

  protected async restoreDefault() {
    this.acting.set(true);

    try {
      for (const override of this.overrides.value() ?? []) {
        await this.service.removerOverride(this.companyId(), override.documentTypeId);
      }

      this.toaster.success('Checklist restaurado para o padrão do template.');
      this.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível restaurar o padrão.'));
    } finally {
      this.acting.set(false);
      this.confirmRestore.set(false);
    }
  }

  private reload() {
    this.checklist.reload();
    this.overrides.reload();
  }
}
