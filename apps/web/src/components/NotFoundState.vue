<script setup lang="ts">
import { Button } from '@/components/ui/button';

defineProps<{
  title: string;
  to: string;
  backLabel: string;
}>();
</script>

<template>
  <div class="flex flex-col items-center gap-3 px-6 py-12 text-center" role="alert">
    <p class="text-foreground text-base font-medium">{{ title }}</p>
    <p class="text-muted-foreground max-w-md text-sm">
      O endereço pode estar errado ou o registro não existe mais.
    </p>
    <Button variant="outline" class="mt-1 shadow-xs" as-child>
      <RouterLink :to="to">{{ backLabel }}</RouterLink>
    </Button>
  </div>
</template>
