import { Component, computed, input } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideMinus,
  lucidePlus,
  lucideRotateCcw,
  lucideSquareCheckBig,
  lucideCircleCheck,
  lucideCircleSlash,
  lucideClock,
  lucideLock,
  lucideTriangleAlert,
  lucideUpload,
  lucideX,
} from '@ng-icons/lucide';

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'closed';

/* Tons por token semântico (ver styles.css): `*-foreground` sobre `*-surface` é o par que
   passa AA em 11px nos dois temas — a paleta crua `-600` sobre `-50` ficava em 3.1:1. */
const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  info: 'bg-info-surface text-info-foreground border-info-border',
  success: 'bg-success-surface text-success-foreground border-success-border',
  danger: 'bg-danger-surface text-danger-foreground border-danger-border',
  warning: 'bg-warning-surface text-warning-foreground border-warning-border',
  closed: 'bg-muted text-muted-foreground border-border',
};

const STATUS: Record<string, { label: string; tone: Tone; icon: string }> = {
  pending: { label: 'Pendente', tone: 'neutral', icon: 'lucideClock' },
  submitted: { label: 'Enviado', tone: 'info', icon: 'lucideUpload' },
  accepted: { label: 'Aceito', tone: 'success', icon: 'lucideCheck' },
  rejected: { label: 'Rejeitado', tone: 'danger', icon: 'lucideX' },
  open: { label: 'Aberta', tone: 'info', icon: 'lucideUpload' },
  complete: { label: 'Completa', tone: 'success', icon: 'lucideCircleCheck' },
  closed: { label: 'Encerrada', tone: 'closed', icon: 'lucideLock' },
  overdue: { label: 'Atrasado', tone: 'warning', icon: 'lucideClock' },
  queued: { label: 'Na fila', tone: 'neutral', icon: 'lucideClock' },
  sent: { label: 'Enviada', tone: 'info', icon: 'lucideUpload' },
  delivered: { label: 'Entregue', tone: 'success', icon: 'lucideCircleCheck' },
  failed: { label: 'Falhou', tone: 'danger', icon: 'lucideTriangleAlert' },
  inactive: { label: 'Inativa', tone: 'closed', icon: 'lucideCircleSlash' },
  active: { label: 'Ativa', tone: 'success', icon: 'lucideCircleCheck' },
  extra: { label: 'Documento extra', tone: 'info', icon: 'lucideUpload' },
  /* Reenviado é pendência, não entrega: o Contador ainda tem de conferir. Por isso tom de
     aviso, e não o azul de "enviado". */
  resent: { label: 'Reenviado', tone: 'warning', icon: 'lucideRotateCcw' },
  removed: { label: 'Removido', tone: 'warning', icon: 'lucideMinus' },
  added: { label: 'Adicionado', tone: 'info', icon: 'lucidePlus' },
  not_applicable: { label: 'Não se aplica', tone: 'neutral', icon: 'lucideCircleSlash' },
  own_template: { label: 'Meu modelo', tone: 'info', icon: 'lucideSquareCheckBig' },
  connected: { label: 'Ativo', tone: 'success', icon: 'lucideCircleCheck' },
  disconnected: { label: 'Não conectado', tone: 'closed', icon: 'lucideCircleSlash' },
};

@Component({
  selector: 'app-status-pill',
  imports: [NgIcon],
  providers: [
    provideIcons({
      lucideCheck,
      lucideMinus,
      lucidePlus,
      lucideRotateCcw,
      lucideSquareCheckBig,
      lucideCircleCheck,
      lucideCircleSlash,
      lucideClock,
      lucideLock,
      lucideTriangleAlert,
      lucideUpload,
      lucideX,
    }),
  ],
  template: `
    <span
      class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold"
      [class]="tone()"
      [attr.title]="title()"
    >
      <ng-icon [name]="icon()" class="text-[12px]" aria-hidden="true" />
      {{ label() }}
    </span>
  `,
})
export class StatusPill {
  readonly status = input.required<string>();
  readonly text = input<string>();
  /** tooltip opcional (ex.: por que o item não se aplica) */
  readonly title = input<string>();

  private readonly entry = computed(
    () =>
      STATUS[this.status()] ?? {
        label: this.status(),
        tone: 'neutral' as Tone,
        icon: 'lucideClock',
      },
  );

  protected readonly label = computed(() => this.text() ?? this.entry().label);
  protected readonly tone = computed(() => TONE_CLASS[this.entry().tone]);
  protected readonly icon = computed(() => this.entry().icon);
}
