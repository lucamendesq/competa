<script setup lang="ts">
import { computed } from 'vue'
import { itemRejections } from '@/utils/item-status'

type ItemWithRejections = Parameters<typeof itemRejections>[0]

const props = defineProps<{
  item: ItemWithRejections
  hint?: string
}>()

const rejections = computed(() => itemRejections(props.item))
</script>

<template>
  <span class="border-danger-border bg-danger-surface mt-2 block rounded-lg border p-3">
    <span class="text-danger-foreground block text-sm font-semibold">Precisa reenviar</span>
    <span v-for="(rejection, index) in rejections" :key="index" class="text-danger-foreground mt-1 block text-xs">
      {{ rejection.fileName }}: {{ rejection.rejectionReason }}
    </span>
    <span v-if="hint" class="text-danger-foreground mt-2 block text-xs">{{ hint }}</span>
  </span>
</template>
