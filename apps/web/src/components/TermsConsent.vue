<script setup lang="ts">
defineProps<{ action: string }>();
</script>

<template>
  <p class="text-muted-foreground text-xs">
    {{ action }}, você aceita os
    <RouterLink to="/termos" target="_blank" class="text-foreground underline"
      >Termos de Uso</RouterLink
    >
    e a
    <RouterLink to="/privacidade" target="_blank" class="text-foreground underline"
      >Política de Privacidade</RouterLink
    >.
  </p>
</template>
