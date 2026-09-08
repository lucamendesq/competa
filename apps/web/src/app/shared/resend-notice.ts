import { Component, input } from '@angular/core';
import { itemRejections, type Rejection } from './item-status';

type ItemWithRejections = Parameters<typeof itemRejections>[0];

/** "Precisa reenviar" com arquivo e motivo. Era o mesmo bloco copiado nas três telas de
 *  envio do Responsável (e numa delas o `<div>` virava `<span>` por estar dentro de
 *  botão) — daí o `display` vir por classe e não por tag. */
@Component({
  selector: 'app-resend-notice',
  template: `
    <span class="border-danger-border bg-danger-surface mt-2 block rounded-lg border p-3">
      <span class="text-danger-foreground block text-sm font-semibold">Precisa reenviar</span>
      @for (rejection of rejections(); track $index) {
        <span class="text-danger-foreground mt-1 block text-xs">
          {{ rejection.fileName }}: {{ rejection.rejectionReason }}
        </span>
      }
      @if (hint()) {
        <span class="text-danger-foreground mt-2 block text-xs">{{ hint() }}</span>
      }
    </span>
  `,
})
export class ResendNotice {
  readonly item = input.required<ItemWithRejections>();
  readonly hint = input('');

  protected rejections(): readonly Rejection[] {
    return itemRejections(this.item());
  }
}
