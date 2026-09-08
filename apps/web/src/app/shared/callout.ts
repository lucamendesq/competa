import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideInfo,
  lucideLock,
  lucidePartyPopper,
  lucideTriangleAlert,
} from '@ng-icons/lucide';

export type CalloutTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

const TONE_CLASS: Record<CalloutTone, string> = {
  danger: 'border-danger-border bg-danger-surface text-danger-foreground',
  warning: 'border-warning-border bg-warning-surface text-warning-foreground',
  success: 'border-success-border bg-success-surface text-success-foreground',
  info: 'border-info-border bg-info-surface text-info-foreground',
  neutral: 'border-border bg-muted text-foreground',
};

const TONE_ICON: Record<CalloutTone, string> = {
  danger: 'lucideTriangleAlert',
  warning: 'lucideTriangleAlert',
  success: 'lucideCircleCheck',
  info: 'lucideInfo',
  neutral: 'lucideLock',
};

/** Aviso em bloco — a forma que a UI mais repetia à mão (paleta crua `bg-red-50
 *  border-red-200 text-red-900` e variações, em 22 arquivos). Agora o tom sai de token
 *  semântico, o que também é o que torna o tema escuro possível. */
@Component({
  selector: 'app-callout',
  imports: [NgIcon],
  providers: [
    provideIcons({
      lucideCircleCheck,
      lucideInfo,
      lucideLock,
      lucidePartyPopper,
      lucideTriangleAlert,
    }),
  ],
  template: `
    <div
      class="flex gap-3 rounded-lg border p-3"
      [class]="toneClass()"
      [attr.role]="tone() === 'danger' ? 'alert' : 'status'"
    >
      @if (icon() !== 'none') {
        <ng-icon [name]="iconName()" class="mt-0.5 shrink-0 text-base" aria-hidden="true" />
      }
      <div class="min-w-0 flex-1 text-sm">
        @if (heading()) {
          <p class="font-semibold">{{ heading() }}</p>
        }
        <ng-content />
      </div>
      <ng-content select="[calloutActions]" />
    </div>
  `,
})
export class Callout {
  readonly tone = input<CalloutTone>('info');
  readonly heading = input('');
  /** `none` esconde o ícone; qualquer nome lucide substitui o padrão do tom. */
  readonly icon = input('');

  protected readonly toneClass = computed(() => TONE_CLASS[this.tone()]);
  protected readonly iconName = computed(() => this.icon() || TONE_ICON[this.tone()]);
}
