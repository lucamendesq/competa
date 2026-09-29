<script setup lang="ts">
import { computed } from 'vue';
import { CircleCheck, Info, Lock, TriangleAlert } from 'lucide-vue-next';

export type CalloutTone = 'danger' | 'warning' | 'success' | 'info' | 'neutral';

const props = withDefaults(
  defineProps<{
    tone?: CalloutTone;
    heading?: string;
    icon?: string | 'none';
  }>(),
  {
    tone: 'info',
  },
);

const TONE_CLASS: Record<CalloutTone, string> = {
  danger: 'border-danger-border bg-danger-surface text-danger-foreground',
  warning: 'border-warning-border bg-warning-surface text-warning-foreground',
  success: 'border-success-border bg-success-surface text-success-foreground',
  info: 'border-info-border bg-info-surface text-info-foreground',
  neutral: 'border-border bg-muted text-foreground',
};

const TONE_ICON: Record<CalloutTone, any> = {
  danger: TriangleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
  neutral: Lock,
};

const toneClass = computed(() => TONE_CLASS[props.tone]);
const iconComponent = computed(() => {
  if (props.icon === 'none') return null;
  // Note: custom icons are not supported by name dynamically without a registry.
  // We use the default tone icon. If you need a specific icon, you can pass it via slot.
  return TONE_ICON[props.tone];
});
</script>

<template>
  <div
    class="flex gap-3 rounded-lg border p-3"
    :class="toneClass"
    :role="tone === 'danger' ? 'alert' : 'status'"
  >
    <component
      v-if="iconComponent"
      :is="iconComponent"
      class="mt-0.5 shrink-0 text-base"
      aria-hidden="true"
    />

    <div class="min-w-0 flex-1 text-sm">
      <p v-if="heading" class="font-semibold">{{ heading }}</p>
      <slot></slot>
    </div>

    <slot name="actions"></slot>
  </div>
</template>
