<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useForm, useField } from 'vee-validate';
import * as z from 'zod';
import { email as emailSchema } from '@competa/contracts';
import { toTypedSchema } from '@vee-validate/zod';
import { ArrowRight, CircleAlert, MailCheck, ArrowLeft } from 'lucide-vue-next';
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
  email: emailSchema().min(1, 'Informe seu e-mail.'),
});

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
});

const { value: email, errorMessage: emailError, meta: emailMeta } = useField<string>('email');

const onSubmit = handleSubmit(async (values) => {
  submitError.value = null;
  try {
    await authStore.requestPasswordReset(values.email);
    success.value = true;
  } catch (err: any) {
    submitError.value = apiErrorMessage(err, 'Não foi possível solicitar a recuperação.');
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
          <MailCheck class="h-6 w-6" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Verifique seu e-mail</h1>
        <p class="text-muted-foreground mt-2 text-sm">
          Enviamos um link para você redefinir sua senha.
        </p>
        <Button class="mt-6 w-full" variant="outline" @click="router.push('/entrar')">
          Voltar para o login
        </Button>
      </div>

      <div v-else>
        <div class="text-center mb-6">
          <h1 class="text-xl font-semibold tracking-tight">Esqueci minha senha</h1>
          <p class="text-muted-foreground mt-2 text-sm">
            Informe seu e-mail para receber um link de recuperação.
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
            <Label for="email">
              E-mail <span class="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="email"
              type="email"
              v-model="email"
              :aria-describedby="emailError && emailMeta.touched ? 'email-error' : undefined"
            />
            <p
              v-if="emailError && emailMeta.touched"
              id="email-error"
              class="text-destructive text-xs"
            >
              {{ emailError }}
            </p>
          </div>

          <Button size="lg" type="submit" class="mt-2 w-full" :disabled="isSubmitting">
            {{ isSubmitting ? 'Enviando…' : 'Enviar e-mail' }}
            <ArrowRight class="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>

        <p class="text-muted-foreground mt-6 text-center text-sm">
          <RouterLink to="/entrar" class="inline-flex items-center hover:underline">
            <ArrowLeft class="mr-1 h-3 w-3" />
            Voltar para o login
          </RouterLink>
        </p>
      </div>
    </div>
  </div>
</template>
