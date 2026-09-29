<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    count?: number;
  }>(),
  {
    count: 5,
  },
);

const rows = computed(() => Array.from({ length: props.count }));
</script>

<template>
  <div class="flex flex-col gap-2 p-4" role="status" aria-live="polite">
    <span class="sr-only">Carregando…</span>
    <div
      v-for="(_, index) in rows"
      :key="index"
      class="bg-muted h-11 animate-pulse rounded-lg"
    ></div>
  </div>
</template>
