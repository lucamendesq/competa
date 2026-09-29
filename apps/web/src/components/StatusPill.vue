<script setup lang="ts">
import { computed } from 'vue';
import {
  Check,
  Minus,
  Plus,
  RotateCcw,
  SquareCheckBig,
  CircleCheck,
  CircleSlash,
  Clock,
  Lock,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-vue-next';

const props = defineProps<{
  status: string;
  text?: string;
  title?: string;
}>();

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'closed';

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-border',
  info: 'bg-info-surface text-info-foreground border-info-border',
  success: 'bg-success-surface text-success-foreground border-success-border',
  danger: 'bg-danger-surface text-danger-foreground border-danger-border',
  warning: 'bg-warning-surface text-warning-foreground border-warning-border',
  closed: 'bg-muted text-muted-foreground border-border',
};

const STATUS: Record<string, { label: string; tone: Tone; icon: any }> = {
  pending: { label: 'Pendente', tone: 'neutral', icon: Clock },
  submitted: { label: 'Enviado', tone: 'info', icon: Upload },
  accepted: { label: 'Aceito', tone: 'success', icon: Check },
  rejected: { label: 'Rejeitado', tone: 'danger', icon: X },
  open: { label: 'Aberta', tone: 'info', icon: Upload },
  complete: { label: 'Completa', tone: 'success', icon: CircleCheck },
  closed: { label: 'Encerrada', tone: 'closed', icon: Lock },
  overdue: { label: 'Atrasado', tone: 'warning', icon: Clock },
  queued: { label: 'Na fila', tone: 'neutral', icon: Clock },
  sent: { label: 'Enviada', tone: 'info', icon: Upload },
  delivered: { label: 'Entregue', tone: 'success', icon: CircleCheck },
  failed: { label: 'Falhou', tone: 'danger', icon: TriangleAlert },
  inactive: { label: 'Inativa', tone: 'closed', icon: CircleSlash },
  active: { label: 'Ativa', tone: 'success', icon: CircleCheck },
  extra: { label: 'Documento extra', tone: 'info', icon: Upload },
  resent: { label: 'Reenviado', tone: 'warning', icon: RotateCcw },
  removed: { label: 'Removido', tone: 'warning', icon: Minus },
  added: { label: 'Adicionado', tone: 'info', icon: Plus },
  not_applicable: { label: 'Não se aplica', tone: 'neutral', icon: CircleSlash },
  own_template: { label: 'Meu modelo', tone: 'info', icon: SquareCheckBig },
  connected: { label: 'Ativo', tone: 'success', icon: CircleCheck },
  disconnected: { label: 'Não conectado', tone: 'closed', icon: CircleSlash },
};

const entry = computed(
  () =>
    STATUS[props.status] ?? {
      label: props.status,
      tone: 'neutral',
      icon: Clock,
    },
);

const label = computed(() => props.text ?? entry.value.label);
const toneClass = computed(() => TONE_CLASS[entry.value.tone]);
const iconComponent = computed(() => entry.value.icon);
</script>

<template>
  <span
    class="inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold"
    :class="toneClass"
    :title="title"
  >
    <component :is="iconComponent" class="text-[12px]" aria-hidden="true" />
    {{ label }}
  </span>
</template>
