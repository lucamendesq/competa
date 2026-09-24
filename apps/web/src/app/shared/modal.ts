import { Component, ElementRef, effect, input, model, viewChild } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX } from '@ng-icons/lucide';

/** `<dialog>` nativo: o navegador já dá foco preso, Esc e backdrop — não há motivo para
 *  reimplementar isso em Angular. */
@Component({
  selector: 'app-modal',
  imports: [NgIcon],
  providers: [provideIcons({ lucideX })],
  template: `
    <!-- eslint-disable @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
    <dialog
      #dialogo
      class="bg-card text-foreground border-border m-auto w-[calc(100vw-2rem)] rounded-xl border p-0 shadow-xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]"
      [class]="wide() ? 'max-w-5xl' : 'max-w-2xl'"
      [attr.aria-labelledby]="titleId"
      (close)="open.set(false)"
      (click)="onBackdropClick($event)"
    >
      <div class="border-border flex items-start justify-between gap-4 border-b p-5">
        <div>
          <h2 [id]="titleId" class="text-lg font-semibold tracking-tight">{{ title() }}</h2>
          @if (description()) {
            <p class="text-muted-foreground mt-1 text-sm">{{ description() }}</p>
          }
        </div>
        <button
          type="button"
          class="hover:bg-muted focus-visible:ring-ring inline-flex size-8 shrink-0 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          (click)="open.set(false)"
        >
          <span class="sr-only">Fechar</span>
          <ng-icon name="lucideX" class="text-base" aria-hidden="true" />
        </button>
      </div>

      <!-- Um slot só: conteúdo dentro de @if/@else do chamador não é projetável por
           seletor, então o rodapé é do próprio chamador (classe .modal-footer). -->
      <div class="max-h-[70vh] overflow-y-auto p-5">
        <ng-content />
      </div>
    </dialog>
  `,
})
export class Modal {
  readonly open = model.required<boolean>();
  readonly title = input.required<string>();
  readonly description = input<string>();
  /** preview de arquivo precisa de largura; o resto dos modais não */
  readonly wide = input(false);

  protected readonly titleId = `modal-titulo-${Math.random().toString(36).slice(2, 8)}`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialogo');

  protected onBackdropClick(event: MouseEvent) {
    const element = this.dialog().nativeElement;
    if (event.target === element) {
      const rect = element.getBoundingClientRect();
      const isInside =
        rect.top <= event.clientY &&
        event.clientY <= rect.bottom &&
        rect.left <= event.clientX &&
        event.clientX <= rect.right;

      if (!isInside) {
        this.open.set(false);
      }
    }
  }

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;

      if (this.open() && !element.open) element.showModal();
      if (!this.open() && element.open) element.close();
    });
  }
}
