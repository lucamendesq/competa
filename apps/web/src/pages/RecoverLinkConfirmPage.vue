<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CircleAlert, MailCheck, RefreshCcw } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import Logo from '@/components/Logo.vue';
import { useAuthStore } from '@/stores/auth';
import { apiErrorMessage } from '@/api/error';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const token = route.query.token as string | undefined;

const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

async function confirm() {
  if (!token) return;
  loading.value = true;
  error.value = null;
  try {
    await authStore.confirmRecoverLink(token);
    success.value = true;
  } catch (err: any) {
    error.value = apiErrorMessage(err, 'Não foi possível confirmar. O link pode ter expirado.');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="bg-muted/40 min-h-dvh flex items-center justify-center p-4 sm:p-8">
    <div class="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
      <div class="flex justify-center mb-6">
        <Logo class="h-8" />
      </div>

      <div v-if="!token" class="text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-surface text-danger-foreground"
        >
          <CircleAlert class="h-6 w-6" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Link inválido</h1>
        <p class="text-muted-foreground mt-2 text-sm">
          O link acessado não possui o token necessário.
        </p>
        <Button class="mt-6 w-full" variant="outline" @click="router.push('/entrar')">
          Voltar para o início
        </Button>
      </div>

      <div v-else-if="success" class="text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <MailCheck class="h-6 w-6" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Link renovado</h1>
        <p class="text-muted-foreground mt-2 text-sm">
          Enviamos seu novo link de acesso por e-mail.
        </p>
      </div>

      <div v-else class="text-center">
        <h1 class="text-xl font-semibold tracking-tight">Confirmar recuperação</h1>
        <p class="text-muted-foreground mt-2 mb-6 text-sm">
          Clique abaixo para gerar um novo link de acesso e recebê-lo em seu e-mail. O link anterior
          deixará de funcionar.
        </p>

        <div
          v-if="error"
          class="mb-6 flex gap-3 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground text-left"
          role="alert"
        >
          <CircleAlert class="mt-0.5 shrink-0 text-base h-4 w-4" aria-hidden="true" />
          <p>{{ error }}</p>
        </div>

        <Button size="lg" class="w-full" :disabled="loading" @click="confirm">
          <RefreshCcw v-if="loading" class="mr-2 h-4 w-4 animate-spin" />
          {{ loading ? 'Gerando...' : 'Gerar novo link' }}
        </Button>
      </div>
    </div>
  </div>
</template>
