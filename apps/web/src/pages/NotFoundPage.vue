<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo.vue';
import { useAuthStore } from '@/stores/auth';

const route = useRoute();
const authStore = useAuthStore();
const ready = ref(false);

onMounted(async () => {
  await authStore.ensureLoaded();
  ready.value = true;
});

const home = computed(() => {
  if (authStore.accountant) return { to: '/competencias', label: 'Ir para o painel' };
  if (authStore.contact)
    return { to: '/minha-area/pendencias', label: 'Ir para minhas pendências' };
  return { to: '/entrar', label: 'Entrar' };
});
</script>

<template>
  <main
    class="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center"
  >
    <Logo class="h-8" />
    <p class="text-muted-foreground text-sm font-semibold uppercase tracking-wider">Erro 404</p>
    <h1 class="text-2xl font-bold tracking-tight">Página não encontrada</h1>
    <p class="text-muted-foreground text-sm">
      O endereço <code class="bg-muted rounded px-1.5 py-0.5 text-xs">{{ route.fullPath }}</code>
      não existe.
    </p>
    <Button v-if="ready" as-child>
      <RouterLink :to="home.to">{{ home.label }}</RouterLink>
    </Button>
  </main>
</template>
