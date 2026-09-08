import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideDownload,
  lucideMail,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { PageHeader } from '../../shared/page-header';
import { Callout } from '../../shared/callout';
import { ChecklistsService } from '../checklists/checklists.service';
import { CompaniesService, ImportResult } from './companies.service';

const COLUMNS = [
  { key: 'name', label: 'Nome da empresa', required: true },
  { key: 'template', label: 'Nome do template de checklist', required: true },
  { key: 'cnpj', label: 'CNPJ (com ou sem máscara)', required: false },
  { key: 'contact_name', label: 'Nome do Responsável', required: false },
  { key: 'contact_email', label: 'E-mail do Responsável', required: false },
  { key: 'contact_phone', label: 'WhatsApp do Responsável', required: false },
  {
    key: 'flags',
    label: 'Características (has_employees, accepts_card_payments, has_inventory)',
    required: false,
  },
];

@Component({
  selector: 'app-import-companies-page',
  imports: [RouterLink, NgIcon, HlmButtonImports, HlmTableImports, PageHeader, Callout],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideCircleCheck,
      lucideDownload,
      lucideMail,
      lucideUpload,
    }),
  ],
  templateUrl: './import-companies-page.html',
})
export class ImportCompaniesPage {
  private readonly service = inject(CompaniesService);
  private readonly checklists = inject(ChecklistsService);
  private readonly toaster = inject(Toaster);

  protected readonly columns = COLUMNS;
  protected readonly templates = this.checklists.templates();

  protected readonly file = signal<{ name: string; content: string } | null>(null);
  protected readonly sending = signal(false);
  protected readonly dragging = signal(false);
  protected readonly result = signal<ImportResult | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly summary = computed(() => {
    const current = this.result();

    return {
      total: current?.total ?? 0,
      created: current?.created ?? 0,
      errors: current?.failed ?? 0,
    };
  });

  protected async choose(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (file) await this.read(file);
  }

  protected async drop(event: DragEvent) {
    event.preventDefault();
    this.dragging.set(false);

    const file = event.dataTransfer?.files?.[0];
    if (file) await this.read(file);
  }

  private async read(file: File) {
    this.error.set(null);

    if (!/\.csv$/i.test(file.name)) {
      this.error.set('Envie um arquivo .csv. Planilhas .xlsx precisam ser exportadas como CSV.');
      return;
    }

    this.file.set({ name: file.name, content: await file.text() });
  }

  protected async importCsv() {
    const current = this.file();
    if (!current) return;

    this.sending.set(true);
    this.error.set(null);

    try {
      const importResult = await this.service.importCsv(current.content);
      this.result.set(importResult);

      this.toaster.success(
        importResult.created === 1
          ? '1 empresa importada.'
          : `${importResult.created} empresas importadas.`,
      );
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Não foi possível importar a planilha.'));
    } finally {
      this.sending.set(false);
    }
  }

  protected readonly inviting = signal(false);
  protected readonly invitesSent = signal<number | null>(null);

  protected readonly importedIds = computed(() =>
    (this.result()?.lines ?? [])
      .filter((line) => line.status === 'created')
      .map((line) => line.companyId),
  );

  /** A importação não manda email por linha: 30 linhas com uma coluna errada seriam 30
   *  emails errados. O convite sai daqui, depois de você ver o relatório. */
  protected async sendInvites() {
    this.inviting.set(true);

    try {
      const result = await this.service.sendAccessInvites(this.importedIds());
      this.invitesSent.set(result.invited);
      this.toaster.success(
        result.invited === 1
          ? '1 convite de acesso enviado.'
          : `${result.invited} convites de acesso enviados.`,
      );
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível enviar os convites.'));
    } finally {
      this.inviting.set(false);
    }
  }

  protected restart() {
    this.file.set(null);
    this.result.set(null);
    this.error.set(null);
    this.invitesSent.set(null);
  }

  protected downloadTemplate() {
    const header = this.columns.map((column) => column.key).join(',');
    const example = [
      'Padaria Pão Quente Ltda',
      this.templates.value()?.[0]?.name ?? 'MEI',
      '11.222.333/0001-81',
      'Maria Souza',
      'maria@padaria.com.br',
      '(11) 98888-7777',
      'has_employees',
    ].join(',');

    const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = 'modelo-empresas.csv';
    anchor.click();
    URL.revokeObjectURL(url);
  }
}
