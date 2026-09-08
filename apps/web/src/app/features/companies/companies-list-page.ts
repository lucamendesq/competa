import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideCircleCheck,
  lucideClock,
  lucideMail,
  lucideMailX,
  lucidePencil,
  lucidePlus,
  lucideSearch,
  lucideSend,
  lucideSquareCheckBig,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { Pagination } from '../../shared/pagination';
import { StatusPill } from '../../shared/status-pill';
import { maskedCnpj } from '../../shared/format';
import { Company, CompaniesService } from './companies.service';

@Component({
  selector: 'app-companies-list-page',
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
    Modal,
    Pagination,
    StatusPill,
  ],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideCircleCheck,
      lucideClock,
      lucideMail,
      lucideMailX,
      lucidePencil,
      lucidePlus,
      lucideSearch,
      lucideSend,
      lucideSquareCheckBig,
      lucideUpload,
    }),
  ],
  templateUrl: './companies-list-page.html',
})
export class CompaniesListPage {
  private readonly service = inject(CompaniesService);
  private readonly toaster = inject(Toaster);

  protected readonly maskedCnpj = maskedCnpj;

  protected readonly inviting = signal<string | null>(null);

  /** "Convidar para o app": oferta avulsa. A Empresa é cobrada pelo link com ou sem isto. */
  protected async inviteToApp(company: Company) {
    this.inviting.set(company.id);

    try {
      const result = await this.service.sendAccessInvites([company.id]);

      this.toaster[result.invited ? 'success' : 'info'](
        result.invited
          ? `Convite enviado para o Responsável de ${company.name}.`
          : 'Já existe um convite pendente para este Responsável.',
      );
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível enviar o convite.'));
    } finally {
      this.inviting.set(null);
    }
  }

  protected readonly page = signal(1);
  protected readonly perPage = 20;
  protected readonly state = signal<'todas' | 'ativas' | 'inativas'>('ativas');
  protected readonly search = signal('');

  protected readonly companies = this.service.list(() => ({
    page: this.page(),
    perPage: this.perPage,
    active: this.state() === 'todas' ? undefined : this.state() === 'ativas' ? 'true' : 'false',
  }));

  /** Vazio por filtro ≠ carteira vazia. Se a API trouxe linhas e a busca local escondeu
   *  todas, é filtro; se não trouxe nenhuma e os filtros estão no padrão, é carteira vazia
   *  de verdade. (A busca só enxerga a página carregada — daí o texto explicar isso.) */
  protected readonly filteredEmpty = computed(() => {
    if (this.visible().length) return false;

    return this.companies.value().data.length > 0 || this.search().trim().length > 0;
  });

  protected clearFilters() {
    this.search.set('');
    this.state.set('ativas');
  }

  protected readonly visible = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rows = this.companies.value().data;

    if (!term) return rows;

    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(term) ||
        (row.cnpj ?? '').replace(/\D/g, '').includes(term.replace(/\D/g, '')),
    );
  });

  protected readonly statuses = [
    { value: 'ativas' as const, label: 'Ativas' },
    { value: 'inativas' as const, label: 'Inativas' },
    { value: 'todas' as const, label: 'Todas' },
  ];

  protected readonly confirmDeactivate = signal<Company | null>(null);
  protected readonly acting = signal(false);

  protected async deactivate(company: Company) {
    this.acting.set(true);

    try {
      await this.service.deactivate(company.id);
      this.toaster.success(`${company.name} foi desativada.`);
      this.companies.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível desativar a empresa.'));
    } finally {
      this.acting.set(false);
      this.confirmDeactivate.set(null);
    }
  }

  protected async reactivate(company: Company) {
    this.acting.set(true);

    try {
      await this.service.update(company.id, { active: true });
      this.toaster.success(`${company.name} foi reativada.`);
      this.companies.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível reativar a empresa.'));
    } finally {
      this.acting.set(false);
    }
  }
}
