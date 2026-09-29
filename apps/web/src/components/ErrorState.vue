<script setup lang="ts">
withDefaults(defineProps<{
  message?: string
}>(), {
  message: 'Erro inesperado. Tente novamente.'
})

const emit = defineEmits<{
  retry: []
}>()
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
    <p class="text-foreground text-base font-medium">Não foi possível carregar</p>
    <p class="text-muted-foreground max-w-md text-sm">{{ message }}</p>
    <button
      type="button"
      class="border-border hover:bg-muted focus-visible:ring-ring mt-1 inline-flex h-9 items-center rounded-lg border px-3 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
      @click="emit('retry')"
    >
      Tentar novamente
    </button>
  </div>
</template>
