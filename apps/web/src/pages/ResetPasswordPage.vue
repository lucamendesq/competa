<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useForm, useField } from 'vee-validate';
import * as z from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { ArrowRight, CircleAlert, CheckCircle } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/Logo.vue';
import { useAuthStore } from '@/stores/auth';
import { apiErrorMessage } from '@/api/error';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const token = route.query.token as string | undefined;

const submitError = ref<string | null>(null);
const success = ref(false);

const schema = z.object({
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
});

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
});

const {
  value: password,
  errorMessage: passwordError,
  meta: passwordMeta,
} = useField<string>('password');

const onSubmit = handleSubmit(async (values) => {
  if (!token) return;
  submitError.value = null;
  try {
    await authStore.resetPassword(values.password, token);
    success.value = true;
  } catch (err: any) {
    submitError.value = apiErrorMessage(err, 'Não foi possível redefinir a senha.');
  }
});
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
          Voltar para o login
        </Button>
      </div>

      <div v-else-if="success" class="text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <CheckCircle class="h-6 w-6" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Senha alterada</h1>
        <p class="text-muted-foreground mt-2 text-sm">Sua senha foi atualizada com sucesso.</p>
        <Button class="mt-6 w-full" @click="router.push('/entrar')"> Entrar no painel </Button>
      </div>

      <div v-else>
        <div class="text-center mb-6">
          <h1 class="text-xl font-semibold tracking-tight">Nova senha</h1>
          <p class="text-muted-foreground mt-2 text-sm">
            Defina uma nova senha para acessar sua conta.
          </p>
        </div>

        <div
          v-if="submitError"
          class="mb-6 flex gap-3 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
          role="alert"
        >
          <CircleAlert class="mt-0.5 shrink-0 text-base h-4 w-4" aria-hidden="true" />
          <p>{{ submitError }}</p>
        </div>

        <form class="flex flex-col gap-4" @submit="onSubmit">
          <div class="flex flex-col gap-1.5">
            <Label for="password">
              Nova senha <span class="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="password"
              type="password"
              v-model="password"
              :aria-describedby="
                passwordError && passwordMeta.touched ? 'password-error' : undefined
              "
            />
            <p
              v-if="passwordError && passwordMeta.touched"
              id="password-error"
              class="text-destructive text-xs"
            >
              {{ passwordError }}
            </p>
          </div>

          <Button size="lg" type="submit" class="mt-2 w-full" :disabled="isSubmitting">
            {{ isSubmitting ? 'Salvando…' : 'Redefinir senha' }}
            <ArrowRight class="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </div>
  </div>
</template>
