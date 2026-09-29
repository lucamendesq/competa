<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next';
import { cn } from '@/utils/utils';

const props = defineProps<{
  class?: string;
}>();
</script>

<template>
  <Loader2
    :class="cn('inline-flex text-[length:--spacing(4)] motion-safe:animate-spin', props.class)"
    aria-label="Carregando"
    role="status"
  />
</template>
