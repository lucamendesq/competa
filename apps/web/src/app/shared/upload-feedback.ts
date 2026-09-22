import { Component, computed, input, output } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { Modal } from './modal';
import type { FileResult } from './upload';

@Component({
  selector: 'app-upload-feedback',
  imports: [NgIcon, HlmButtonImports, Modal],
  providers: [provideIcons({ lucideX })],
  template: `
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
              class="mt-0.5 shrink-0 text-base text-danger"
              aria-hidden="true"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium">{{ result.fileName }}</p>
              <p class="mt-0.5 text-xs text-danger">{{ result.reason }}</p>
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
  readonly results = input<FileResult[] | null>(null);

  readonly dismiss = output<void>();
  readonly retry = output<File[]>();

  protected readonly refusedFiles = computed(() =>
    (this.results() ?? []).filter((result) => !result.ok),
  );
  protected readonly retriable = computed(() =>
    this.refusedFiles().flatMap((result) => (result.retriable && result.file ? [result.file] : [])),
  );
  protected readonly sentCount = computed(
    () => (this.results() ?? []).filter((result) => result.ok).length,
  );
}
