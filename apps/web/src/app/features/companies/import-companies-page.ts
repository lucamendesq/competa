import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleAlert,
  lucideCircleCheck,
  lucideClock,
  lucideDownload,
  lucideMail,
  lucideUpload,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmTableImports } from '@spartan-ng/helm/table';
import { COMPANY_FLAGS } from '@contabilidade/contracts';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { PageHeader } from '../../shared/page-header';
import { Callout } from '../../shared/callout';
import { FLAG_LABEL } from '../../shared/format';
import {
  CompaniesService,
  ImportPreviewLine,
  ImportPreviewResult,
  ImportResult,
} from './companies.service';

const COLUMNS: { header: string; key: string; required: boolean; label?: string }[] = [
  { header: 'Empresa', key: 'name', required: true },
  { header: 'CNPJ', key: 'cnpj', required: false },
  { header: 'Responsável', key: 'contact_name', required: false },
  { header: 'E-mail do responsável', key: 'contact_email', required: false },
  { header: 'Telefone', key: 'contact_phone', required: false },
  ...COMPANY_FLAGS.map((flag) => ({
    header: FLAG_LABEL[flag],
    key: `flag_${flag}`,
    label: 'Sim ou Não',
    required: false,
  })),
];

@Component({
  selector: 'app-import-companies-page',
  imports: [NgIcon, HlmButtonImports, HlmTableImports, PageHeader, Callout],
  providers: [
    provideIcons({
      lucideCircleAlert,
      lucideCircleCheck,
      lucideClock,
      lucideDownload,
      lucideMail,
      lucideUpload,
    }),
  ],
  templateUrl: './import-companies-page.html',
})
export class ImportCompaniesPage {
  private readonly service = inject(CompaniesService);
  private readonly toaster = inject(Toaster);
  private readonly router = inject(Router);

  protected readonly columns = COLUMNS;

  protected readonly file = signal<{ name: string; content: string } | null>(null);
  protected readonly sending = signal(false);
  protected readonly dragging = signal(false);
  protected readonly error = signal<string | null>(null);

  /* Nada é criado na validação — só depois que o Contador confirma (ao enviar convite
   * ou ao concluir). Sem isto, reenviar a planilha corrigida duplicava quem já tinha
   * dado certo na primeira tentativa. */
  protected readonly preview = signal<ImportPreviewResult | null>(null);
  protected readonly confirmed = signal<ImportResult | null>(null);
  protected readonly confirming = signal(false);

  protected readonly summary = computed(() => {
    const done = this.confirmed();
    if (done) return { total: done.total, created: done.created, errors: done.failed };

    const current = this.preview();
    return { total: current?.total ?? 0, created: 0, errors: current?.failed ?? 0 };
  });

  private readonly pendingRows = computed(
    () =>
      (this.preview()?.lines ?? []).filter((line) => line.status === 'pending') as Extract<
        ImportPreviewLine,
        { status: 'pending' }
      >[],
  );

  /** Antes de confirmar: linhas prontas + linhas com erro. Depois: linhas criadas +
   *  as mesmas linhas com erro (erro não se resolve reconfirmando, só reimportando). */
  protected readonly displayLines = computed(() => {
    const errorLines = (this.preview()?.lines ?? []).filter((line) => line.status === 'error');
    const done = this.confirmed();

    return [...errorLines, ...(done ? done.lines : this.pendingRows())].sort(
      (a, b) => a.line - b.line,
    );
  });

  protected readonly actionableCount = computed(
    () => this.confirmed()?.created ?? this.pendingRows().length,
  );

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

    if (/\.xlsx?$/i.test(file.name)) {
      /* Parse no browser: a API continua recebendo CSV (a fronteira de confiança não
       * muda), e um XLSX malformado só trava a aba de quem enviou. import() dinâmico: a
       * lib não entra no bundle inicial. */
      try {
        const XLSX = await import('xlsx');
        const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        this.file.set({ name: file.name, content: XLSX.utils.sheet_to_csv(firstSheet) });
      } catch {
        this.error.set('Não foi possível ler esta planilha. Exporte como CSV e tente de novo.');
      }
      return;
    }

    if (!/\.csv$/i.test(file.name)) {
      this.error.set('Envie um arquivo .csv ou .xlsx.');
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
      this.preview.set(await this.service.importCsv(current.content));
    } catch (error) {
      this.error.set(apiErrorMessage(error, 'Não foi possível ler a planilha.'));
    } finally {
      this.sending.set(false);
    }
  }

  protected readonly inviting = signal(false);
  protected readonly invitesSent = signal<number | null>(null);

  /** Só cria de fato na primeira vez que o Contador confirma — enviar convite ou
   *  concluir de novo depois disso não reimporta nada. */
  private async ensureConfirmed(): Promise<string[]> {
    const already = this.confirmed();
    if (already) {
      return already.lines
        .filter((line) => line.status === 'created')
        .map((line) => line.companyId);
    }

    const pending = this.pendingRows().map(({ line, body }) => ({ line, body }));
    if (!pending.length) return [];

    const result = await this.service.confirmImport(pending);
    this.confirmed.set(result);
    this.toaster.success(
      result.created === 1 ? '1 empresa importada.' : `${result.created} empresas importadas.`,
    );

    return result.lines.filter((line) => line.status === 'created').map((line) => line.companyId);
  }

  /** A importação não manda email por linha: 30 linhas com uma coluna errada seriam 30
   *  emails errados. O convite sai daqui, depois de você ver o relatório. */
  protected async sendInvites() {
    this.inviting.set(true);

    try {
      const companyIds = await this.ensureConfirmed();
      const result = await this.service.sendAccessInvites(companyIds);
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

  protected async finish() {
    this.confirming.set(true);

    try {
      await this.ensureConfirmed();
      await this.router.navigate(['/empresas']);
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível concluir a importação.'));
    } finally {
      this.confirming.set(false);
    }
  }

  protected restart() {
    this.file.set(null);
    this.preview.set(null);
    this.confirmed.set(null);
    this.error.set(null);
    this.invitesSent.set(null);
  }

  protected downloadTemplate() {
    const header = this.columns.map((column) => column.header).join(',');
    const example = [
      'Padaria Pão Quente Ltda',
      '11.222.333/0001-81',
      'Maria Souza',
      'maria@padaria.com.br',
      '(11) 98888-7777',
      'Sim',
      'Não',
      'Não',
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
