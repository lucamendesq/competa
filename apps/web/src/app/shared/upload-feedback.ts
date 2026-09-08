import { Component, computed, effect, input, output, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCircleCheck, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { Modal } from './modal';
import type { FileResult } from './upload';

/** O que o Responsável vê durante e depois do envio, nas três telas de envio.
 *
 *  Sucesso NÃO abre modal: o arquivo aparecendo na lista com o selo já é a confirmação, e
 *  o modal só dava um botão para fechar. Recusa continua em modal — o motivo precisa ser
 *  lido, e toast desaparece antes disso. */
@Component({
  selector: 'app-upload-feedback',
  imports: [NgIcon, HlmButtonImports, Modal],
  providers: [provideIcons({ lucideCircleCheck, lucideX })],
  template: `
    @if (sending() || done()) {
      <div
        class="fixed inset-x-0 bottom-0 z-50 p-4 text-sm font-medium"
        [class]="done() ? 'bg-emerald-600 text-white' : 'bg-primary text-primary-foreground'"
        role="status"
        aria-live="polite"
      >
        <div class="mx-auto max-w-2xl">
          @if (done()) {
            <p class="flex items-center justify-center gap-2">
              <ng-icon name="lucideCircleCheck" class="text-base" aria-hidden="true" />
              {{ sentCount() === 1 ? 'Arquivo enviado' : sentCount() + ' arquivos enviados' }}
            </p>
          } @else {
            <p class="text-center">Enviando {{ progress().done }} de {{ progress().total }}…</p>
            <div
              class="mt-2 h-2 overflow-hidden rounded-full bg-white/30"
              role="progressbar"
              [attr.aria-valuenow]="percent()"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="Envio dos arquivos"
            >
              <div class="h-full rounded-full bg-white" [style.width.%]="percent()"></div>
            </div>
          }
        </div>
      </div>
    }

    <app-modal
      [open]="refusedFiles().length > 0"
      (openChange)="$event ? null : dismiss.emit()"
      [title]="
        retriable().length === refusedFiles().length
          ? 'O envio não completou'
          : 'Alguns arquivos não foram aceitos'
      "
      [description]="
        retriable().length === refusedFiles().length
          ? refusedFiles().length === 1
            ? '1 arquivo não chegou'
            : refusedFiles().length + ' arquivos não chegaram'
          : refusedFiles().length === 1
            ? '1 arquivo precisa ser enviado de outra forma'
            : refusedFiles().length + ' arquivos precisam ser enviados de outra forma'
      "
    >
      <ul class="divide-border divide-y" role="list">
        @for (result of refusedFiles(); track $index) {
          <li class="flex items-start gap-3 py-3">
            <ng-icon
              name="lucideX"
              class="mt-0.5 shrink-0 text-base text-red-600"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ result.fileName }}</p>
              <p class="mt-0.5 text-xs text-red-700">{{ result.reason }}</p>
            </div>
          </li>
        }
      </ul>

      @if (sentCount()) {
        <p class="text-muted-foreground mt-4 text-sm">
          Os outros {{ sentCount() }} chegaram e já estão na lista.
        </p>
      }

      <div
        class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
      >
        @if (retriable().length) {
          <button hlmBtn (click)="retry.emit(retriable())">
            Tentar de novo ({{ retriable().length }})
          </button>
          <button hlmBtn variant="ghost" (click)="dismiss.emit()">Deixar para depois</button>
        } @else {
          <button hlmBtn (click)="dismiss.emit()">Entendi</button>
        }
      </div>
    </app-modal>
  `,
})
export class UploadFeedback {
  readonly sending = input(false);
  readonly progress = input<{ done: number; total: number }>({ done: 0, total: 0 });
  readonly results = input<FileResult[] | null>(null);

  readonly dismiss = output<void>();
  /** os arquivos que falharam no transporte, para a tela reenviar o mesmo lote */
  readonly retry = output<File[]>();

  protected readonly refusedFiles = computed(() =>
    (this.results() ?? []).filter((result) => !result.ok),
  );
  /** Só o que falhou no transporte pode ser retentado com o mesmo arquivo. */
  protected readonly retriable = computed(() =>
    this.refusedFiles().flatMap((result) => (result.retriable && result.file ? [result.file] : [])),
  );
  protected readonly sentCount = computed(
    () => (this.results() ?? []).filter((result) => result.ok).length,
  );
  protected readonly percent = computed(() => {
    const { done, total } = this.progress();

    return total ? Math.round((done / total) * 100) : 0;
  });

  /** O selo de concluído se apaga sozinho: é confirmação, não pendência — nada para o
   *  Responsável fechar. */
  protected readonly done = signal(false);

  constructor() {
    effect((onCleanup) => {
      const results = this.results();

      if (this.sending() || !results?.length || this.refusedFiles().length) {
        this.done.set(false);
        return;
      }

      this.done.set(true);
      const timer = setTimeout(() => this.done.set(false), 4000);
      onCleanup(() => clearTimeout(timer));
    });
  }
}
