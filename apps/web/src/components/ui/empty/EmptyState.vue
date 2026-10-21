<script setup lang="ts">
import type { Component } from 'vue';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/utils';

const props = defineProps<{
  class?: string;
  title?: string;
  description?: string;
  icon?: Component;
  actionLabel?: string;
}>();

const emit = defineEmits<{ action: [] }>();
</script>

<template>
  <div
    :class="
      cn(
        'gap-4 rounded-xl border border-dashed border-border bg-card p-12 flex w-full min-w-0 flex-1 flex-col items-center justify-center text-center text-balance',
        props.class,
      )
    "
  >
    <div
      v-if="icon || $slots['media-icon']"
      class="text-muted-foreground flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground"
    >
      <slot name="media-icon">
        <component :is="icon" class="h-6 w-6" aria-hidden="true" />
      </slot>
    </div>
    <div class="space-y-1">
      <h3 v-if="title || $slots.title" class="text-lg font-medium tracking-tight">
        <slot name="title">{{ title }}</slot>
      </h3>
      <p v-if="description || $slots.description" class="text-sm text-muted-foreground">
        <slot name="description">{{ description }}</slot>
      </p>
    </div>
    <slot>
      <Button v-if="actionLabel" class="shadow-xs font-medium" @click="emit('action')">
        {{ actionLabel }}
      </Button>
    </slot>
  </div>
</template>
