import { Component, Service, inject, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';
export type Toast = { id: number; kind: ToastKind; message: string };

@Service()
export class Toaster {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  success(message: string) {
    this.push('success', message);
  }

  error(message: string) {
    this.push('error', message);
  }

  info(message: string) {
    this.push('info', message);
  }

  dismiss(id: number) {
    this.toasts.update((list) => list.filter((toast) => toast.id !== id));
  }

  private push(kind: ToastKind, message: string) {
    const id = this.nextId++;
    this.toasts.update((list) => [...list, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), kind === 'error' ? 8000 : 5000);
  }
}

@Component({
  selector: 'app-toasts',
  template: `
    <div
      class="pointer-events-none fixed inset-x-0 bottom-0 z-100 flex flex-col items-center gap-2 p-4 sm:items-end"
      aria-live="polite"
      aria-atomic="false"
    >
      @for (toast of toaster.toasts(); track toast.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border p-4 shadow-lg"
          [class]="style(toast.kind)"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
        >
          <p class="flex-1 text-sm">{{ toast.message }}</p>
          <button
            type="button"
            class="focus-visible:ring-ring rounded-md p-1 text-xs opacity-70 hover:opacity-100 focus-visible:ring-2 focus-visible:outline-none"
            (click)="toaster.dismiss(toast.id)"
          >
            <span class="sr-only">Fechar aviso</span>
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      }
    </div>
  `,
})
export class Toasts {
  protected readonly toaster = inject(Toaster);

  protected style(kind: ToastKind) {
    if (kind === 'success')
      return 'bg-success-surface border-success-border text-success-foreground';
    if (kind === 'error') return 'bg-danger-surface border-danger-border text-danger-foreground';
    return 'bg-card border-border text-foreground';
  }
}
