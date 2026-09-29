<script setup lang="ts">
import { cn } from '@/utils/utils';

const props = defineProps<{
  class?: string;
  title?: string;
  description?: string;
  icon?: string;
}>();
</script>

<template>
  <div
    :class="
      cn(
        'gap-4 rounded-lg border-dashed p-12 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance',
        props.class,
      )
    "
  >
    <slot name="media">
      <div
        v-if="$slots.media || icon"
        class="text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
      >
        <slot name="media-icon"></slot>
      </div>
    </slot>
    <div class="space-y-1">
      <h3 v-if="title || $slots.title" class="text-lg font-medium tracking-tight">
        <slot name="title">{{ title }}</slot>
      </h3>
      <p v-if="description || $slots.description" class="text-sm text-muted-foreground">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <slot></slot>
  </div>
</template>
