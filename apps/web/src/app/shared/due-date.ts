import { Component, computed, input } from '@angular/core';
import { dateBr, isOverdue } from './format';

/** Prazo do Item com o atraso ESCRITO, não só vermelho (WCAG 1.4.1 — estado nunca é só
 *  cor). Existia copiado em quatro telas, e em duas delas o "· Atrasado" tinha ficado de
 *  fora — justamente nas do Responsável. */
@Component({
  selector: 'app-due-date',
  template: `
    @if (dueDate(); as due) {
      <span
        class="tabular-nums"
        [class]="late() ? 'font-semibold text-red-700' : 'text-muted-foreground'"
      >
        Prazo {{ dateBr(due) }}
        @if (late()) {
          · Atrasado
        }
      </span>
    } @else if (emptyLabel()) {
      <span class="text-muted-foreground">{{ emptyLabel() }}</span>
    }
  `,
})
export class DueDate {
  readonly dueDate = input<string | null>(null);
  /** Item já aceito não está atrasado, mesmo com a data no passado. */
  readonly done = input(false);
  readonly emptyLabel = input('');

  protected readonly dateBr = dateBr;
  protected readonly late = computed(() => !this.done() && isOverdue(this.dueDate()));
}
