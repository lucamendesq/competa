<script setup lang="ts">
defineProps<{
  title: string
  description?: string
}>()
</script>

<template>
  <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
    <div class="min-w-0">
      <h1 class="text-foreground truncate text-2xl font-semibold tracking-tight">
        {{ title }}
      </h1>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm">{{ description }}</p>
    </div>
    <div class="flex shrink-0 flex-wrap items-center gap-2">
      <slot></slot>
    </div>
  </header>
</template>
