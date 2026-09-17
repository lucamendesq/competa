import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideEye, lucideLock, lucideSquareCheckBig, lucideTrash2 } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { EmptyState } from '../../shared/empty-state';
import { ErrorState } from '../../shared/error-state';
import { LoadingRows } from '../../shared/loading-rows';
import { Modal } from '../../shared/modal';
import { PageHeader } from '../../shared/page-header';
import { ChecklistsService } from './checklists.service';
import { StatusPill } from '../../shared/status-pill';

@Component({
  selector: 'app-templates-list-page',
  imports: [
    RouterLink,
    NgIcon,
    HlmButtonImports,
    PageHeader,
    EmptyState,
    ErrorState,
    LoadingRows,
    Modal,
    StatusPill,
  ],
  providers: [provideIcons({ lucideCopy, lucideEye, lucideLock, lucideSquareCheckBig, lucideTrash2 })],
  templateUrl: './templates-list-page.html',
})
export class TemplatesListPage {
  private readonly service = inject(ChecklistsService);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);

  protected readonly templates = this.service.templates();
  protected readonly duplicating = signal<string | null>(null);
  protected readonly deleting = signal<string | null>(null);
  protected readonly confirmDelete = signal<{ id: string; name: string } | null>(null);

  protected readonly fromProduct = computed(
    () => this.templates.value()?.filter((template) => template.isProduct) ?? [],
  );

  protected readonly mine = computed(
    () => this.templates.value()?.filter((template) => !template.isProduct) ?? [],
  );

  protected async duplicate(id: string, nome: string) {
    this.duplicating.set(id);

    try {
      const derived = await this.service.derive(id, `${nome} (meu modelo)`);
      this.toaster.success('Template duplicado. Agora ele é editável.');
      this.templates.reload();
      await this.router.navigate(['/checklists', derived.id]);
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível duplicar o template.'));
    } finally {
      this.duplicating.set(null);
    }
  }

  protected async delete(id: string) {
    this.deleting.set(id);

    try {
      await this.service.deleteTemplate(id);
      this.toaster.success('Modelo excluído com sucesso.');
      this.confirmDelete.set(null);
      this.templates.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível excluir o modelo.'));
    } finally {
      this.deleting.set(null);
    }
  }
}
