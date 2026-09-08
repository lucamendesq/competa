import { Component, computed, input, model } from '@angular/core';

@Component({
  selector: 'app-pagination',
  template: `
    @if (totalPages() > 1) {
      <nav
        class="border-border flex items-center justify-between gap-4 border-t px-4 py-3"
        aria-label="Paginação"
      >
        <p class="text-muted-foreground text-xs">
          Página {{ page() }} de {{ totalPages() }} · {{ total() }} no total
        </p>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="border-border hover:bg-muted focus-visible:ring-ring inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
            [disabled]="page() <= 1"
            (click)="page.set(page() - 1)"
          >
            Anterior
          </button>
          <button
            type="button"
            class="border-border hover:bg-muted focus-visible:ring-ring inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium focus-visible:ring-2 focus-visible:outline-none disabled:opacity-40"
            [disabled]="page() >= totalPages()"
            (click)="page.set(page() + 1)"
          >
            Próxima
          </button>
        </div>
      </nav>
    }
  `,
})
export class Pagination {
  readonly page = model.required<number>();
  readonly total = input.required<number>();
  readonly perPage = input(20);

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.total() / this.perPage())),
  );
}
