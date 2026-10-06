<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
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

const router = useRouter();
const authStore = useAuthStore();

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
  submitError.value = null;
  try {
    await authStore.setContactPassword(values.password);
    success.value = true;
  } catch (err: any) {
    submitError.value = apiErrorMessage(err, 'Não foi possível definir a senha.');
  }
});
</script>

<template>
  <div class="bg-muted/40 min-h-dvh flex items-center justify-center p-4 sm:p-8">
    <div class="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
      <div class="flex justify-center mb-6">
        <Logo class="h-8" />
      </div>

      <div v-if="success" class="text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <CheckCircle class="h-6 w-6" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Senha definida</h1>
        <p class="text-muted-foreground mt-2 text-sm">
          Você já pode acessar sua área exclusiva usando seu e-mail e a nova senha.
        </p>
        <Button class="mt-6 w-full" @click="router.push('/minha-area/pendencias')">
          Ver pendências
        </Button>
      </div>

      <div v-else>
        <div class="text-center mb-6">
          <h1 class="text-xl font-semibold tracking-tight">Definir senha de acesso</h1>
          <p class="text-muted-foreground mt-2 text-sm">
            Crie uma senha para acompanhar as pendências da sua empresa.
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

        <form novalidate class="flex flex-col gap-4" @submit="onSubmit">
          <div class="flex flex-col gap-1.5">
            <Label for="password">
              Senha <span class="text-destructive" aria-hidden="true">*</span>
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
            {{ isSubmitting ? 'Salvando…' : 'Definir senha' }}
            <ArrowRight class="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </div>
  </div>
</template>
