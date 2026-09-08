import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  template: `
    <div class="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
      <p class="text-foreground text-base font-medium">Não foi possível carregar</p>
      <p class="text-muted-foreground max-w-md text-sm">{{ message() }}</p>
      <button
        type="button"
        class="border-border hover:bg-muted focus-visible:ring-ring mt-1 inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        (click)="retry.emit()"
      >
        Tentar novamente
      </button>
    </div>
  `,
})
export class ErrorState {
  readonly message = input('Erro inesperado. Tente novamente.');
  readonly retry = output<void>();
}
