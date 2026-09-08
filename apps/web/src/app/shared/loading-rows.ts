import { Component, input } from '@angular/core';

@Component({
  selector: 'app-loading-rows',
  template: `
    <div class="flex flex-col gap-2 p-4" role="status" aria-live="polite">
      <span class="sr-only">Carregando…</span>
      @for (row of rows(); track $index) {
        <div class="bg-muted h-11 animate-pulse rounded-lg"></div>
      }
    </div>
  `,
})
export class LoadingRows {
  readonly count = input(5);

  protected rows() {
    return Array.from({ length: this.count() });
  }
}
