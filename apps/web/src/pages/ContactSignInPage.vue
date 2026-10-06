<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useForm, useField } from 'vee-validate';
import * as z from 'zod';
import { email as emailSchema } from '@competa/contracts';
import { toTypedSchema } from '@vee-validate/zod';
import { Mail } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/Logo.vue';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'vue-sonner';

const authStore = useAuthStore();
const router = useRouter();

const error = ref<string | null>(null);
const linkSent = ref(false);

// Form for Password Sign In
const SignInForm = z.object({
  email: emailSchema().min(1, 'Informe o seu e-mail.'),
  password: z.string().min(1, 'Informe sua senha.'),
});
const signInForm = useForm({ validationSchema: toTypedSchema(SignInForm) });
const {
  value: email,
  errorMessage: emailError,
  meta: emailMeta,
} = useField<string>('email', undefined, { form: signInForm });
const {
  value: password,
  errorMessage: passwordError,
  meta: passwordMeta,
} = useField<string>('password', undefined, { form: signInForm });

// Form for Magic Link
const LinkForm = z.object({
  linkEmail: emailSchema().min(1, 'Informe o seu e-mail.'),
});
const linkForm = useForm({ validationSchema: toTypedSchema(LinkForm) });
const {
  value: linkEmail,
  errorMessage: linkEmailError,
  meta: linkEmailMeta,
} = useField<string>('linkEmail', undefined, { form: linkForm });

const onSignIn = signInForm.handleSubmit(async (values) => {
  error.value = null;
  try {
    await authStore.signInContact(values.email, values.password);
    router.push('/minha-area/pendencias');
  } catch {
    error.value = 'E-mail ou senha inválidos. Se você entra pelo link, use a opção abaixo.';
  }
});

const onRequestLink = linkForm.handleSubmit(async (values) => {
  error.value = null;
  try {
    await authStore.sendMagicLink(
      values.linkEmail,
      `${window.location.origin}/minha-area/pendencias`,
    );
    linkSent.value = true;
    toast.success('Link de acesso enviado para o seu e-mail.');
  } catch (err: any) {
    error.value =
      err.message || 'Não foi possível enviar o link. Confira o e-mail e tente de novo.';
  }
});
</script>

<template>
  <div class="bg-muted/40 flex min-h-dvh flex-col items-center justify-center gap-6 p-4">
    <Logo class="h-8" />

    <div class="bg-card border-border w-full max-w-md rounded-xl border p-6">
      <h1 class="text-xl font-semibold tracking-tight">Entrar na minha área</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Aqui você vê o que falta enviar, o que já mandou e o que a contabilidade recusou.
      </p>

      <div
        v-if="error"
        class="mt-5 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
        role="alert"
      >
        {{ error }}
      </div>

      <form class="mt-6 flex flex-col gap-4" @submit="onSignIn">
        <div class="flex flex-col gap-1.5">
          <Label for="email-password">
            Seu e-mail <span class="text-destructive" aria-hidden="true">*</span>
            <span class="sr-only">(obrigatório)</span>
          </Label>
          <Input
            id="email-password"
            type="email"
            inputmode="email"
            autocomplete="email"
            placeholder="voce@suaempresa.com.br"
            v-model="email"
            :aria-describedby="emailError && emailMeta.touched ? 'email-error' : undefined"
          />
          <p v-if="emailError && emailMeta.touched" class="text-destructive text-xs">
            {{ emailError }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="access-password-field">Sua senha</Label>
          <Input
            id="access-password-field"
            type="password"
            autocomplete="current-password"
            v-model="password"
            :aria-describedby="passwordError && passwordMeta.touched ? 'password-error' : undefined"
          />
          <p v-if="passwordError && passwordMeta.touched" class="text-destructive text-xs">
            {{ passwordError }}
          </p>
        </div>

        <Button size="lg" type="submit" :disabled="signInForm.isSubmitting.value">
          {{ signInForm.isSubmitting.value ? 'Entrando…' : 'Entrar' }}
        </Button>
      </form>

      <div class="my-6 flex items-center gap-3">
        <span class="bg-border h-px flex-1"></span>
        <span class="text-muted-foreground text-xs">ou receba um link por e-mail</span>
        <span class="bg-border h-px flex-1"></span>
      </div>

      <template v-if="linkSent">
        <p
          class="rounded-lg border border-success-border bg-success-surface p-3 text-sm text-success-foreground"
          role="status"
        >
          Enviamos um link de acesso para <strong>{{ linkEmail }}</strong
          >. Abra o e-mail neste aparelho para entrar.
        </p>
      </template>
      <template v-else>
        <form class="flex flex-col gap-3" @submit="onRequestLink">
          <div class="flex flex-col gap-1.5">
            <Label for="link-email">
              Seu e-mail <span class="text-destructive" aria-hidden="true">*</span>
              <span class="sr-only">(obrigatório)</span>
            </Label>
            <Input
              id="link-email"
              type="email"
              inputmode="email"
              autocomplete="email"
              placeholder="voce@suaempresa.com.br"
              v-model="linkEmail"
              :aria-describedby="linkEmailError && linkEmailMeta.touched ? 'link-error' : undefined"
            />
            <p v-if="linkEmailError && linkEmailMeta.touched" class="text-destructive text-xs">
              {{ linkEmailError }}
            </p>
          </div>

          <Button size="lg" type="submit" :disabled="linkForm.isSubmitting.value">
            <Mail class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ linkForm.isSubmitting.value ? 'Enviando…' : 'Receber link por e-mail' }}
          </Button>
        </form>
      </template>

      <p class="text-muted-foreground mt-6 text-xs">
        Ainda não tem acesso? Você não precisa dele para enviar documentos — use o link que a sua
        contabilidade manda por e-mail.
        <RouterLink to="/perdi-meu-link" class="text-primary font-medium hover:underline">
          Perdi meu link
        </RouterLink>
      </p>
    </div>
  </div>
</template>
