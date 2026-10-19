<script setup lang="ts">
import { History } from 'lucide-vue-next';
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight font-display text-foreground">Histórico</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Consulte as competências anteriores e os documentos enviados pela sua empresa.
      </p>
    </div>

    <div
      class="bg-card border-border rounded-xl border p-12 text-center text-sm text-muted-foreground shadow-sm"
    >
      <div
        class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <History class="size-6" />
      </div>
      <p class="font-medium text-foreground">
        Esta página exibirá o histórico de competências enviadas. Em construção.
      </p>
    </div>
  </div>
</template>
