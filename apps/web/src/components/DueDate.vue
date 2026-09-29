<script setup lang="ts">
import { isOverdue, dateBr } from '@/utils/format'

defineProps<{
  date: string | null
}>()
</script>

<template>
  <span v-if="!date" class="text-muted-foreground text-xs">—</span>
  <span v-else-if="isOverdue(date)" class="font-semibold text-danger">
    Atrasado {{ dateBr(date) }}
  </span>
  <span v-else class="text-muted-foreground text-xs">
    Vence {{ dateBr(date) }}
  </span>
</template>
