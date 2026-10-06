<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useForm, useField } from 'vee-validate';
import * as z from 'zod';
import { toTypedSchema } from '@vee-validate/zod';
import { ArrowRight, CircleAlert, Building, Building2 } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/Logo.vue';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/api/client';
import { apiErrorMessage } from '@/api/error';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const token = route.params.linkToken as string;

const invite = ref<{
  email: string;
  invitedBy: string;
  companyName?: string;
  target: 'accounting_firm' | 'company';
} | null>(null);
const loading = ref(true);
const inviteError = ref<string | null>(null);

onMounted(async () => {
  try {
    invite.value = await api.get(`/invites/${token}`);
  } catch (err: any) {
    inviteError.value = apiErrorMessage(err, 'Convite não encontrado ou expirado.');
  } finally {
    loading.value = false;
  }
});

const schema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.'),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
});

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(schema),
});

const { value: name, errorMessage: nameError, meta: nameMeta } = useField<string>('name');
const {
  value: password,
  errorMessage: passwordError,
  meta: passwordMeta,
} = useField<string>('password');

const submitError = ref<string | null>(null);

const onSubmit = handleSubmit(async (values) => {
  if (!invite.value) return;
  submitError.value = null;

  try {
    if (invite.value.target === 'accounting_firm') {
      await authStore.signUpWithInvite(
        {
          name: values.name,
          email: invite.value.email,
          password: values.password,
        },
        token,
      );
      await authStore.signInAccountant(invite.value.email, values.password);
      router.push('/competencias');
    } else {
      await authStore.acceptContactInvite(token, {
        name: values.name,
        password: values.password,
      });
      await authStore.signInContact(invite.value.email, values.password);
      router.push('/minha-area/pendencias');
    }
  } catch (err: any) {
    submitError.value = apiErrorMessage(err, 'Não foi possível aceitar o convite.');
  }
});
</script>

<template>
  <div class="bg-muted/40 min-h-dvh flex items-center justify-center p-4 sm:p-8">
    <div class="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
      <div class="flex justify-center mb-6">
        <Logo class="h-8" />
      </div>

      <div v-if="loading" class="text-center py-8 text-sm text-muted-foreground">
        Carregando convite…
      </div>

      <div v-else-if="inviteError" class="text-center">
        <div
          class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-danger-surface text-danger-foreground"
        >
          <CircleAlert class="h-6 w-6" />
        </div>
        <h1 class="text-xl font-semibold tracking-tight">Convite inválido</h1>
        <p class="text-muted-foreground mt-2 text-sm">{{ inviteError }}</p>
        <Button class="mt-6 w-full" variant="outline" @click="router.push('/entrar')">
          Ir para o login
        </Button>
      </div>

      <div v-else-if="invite">
        <div class="text-center mb-6">
          <div
            class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
          >
            <Building2 v-if="invite.target === 'accounting_firm'" class="h-6 w-6" />
            <Building v-else class="h-6 w-6" />
          </div>
          <h1 class="text-xl font-semibold tracking-tight">Aceitar convite</h1>
          <p class="text-muted-foreground mt-2 text-sm">
            <template v-if="invite.target === 'accounting_firm'">
              Você foi convidado para participar da contabilidade
              <strong>{{ invite.invitedBy }}</strong
              >.
            </template>
            <template v-else>
              A contabilidade <strong>{{ invite.invitedBy }}</strong> convidou você para enviar
              documentos da empresa <strong>{{ invite.companyName }}</strong
              >.
            </template>
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
            <Label>E-mail</Label>
            <Input
              type="email"
              :model-value="invite.email"
              disabled
              class="bg-muted text-muted-foreground"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="name">
              Seu nome <span class="text-destructive" aria-hidden="true">*</span>
            </Label>
            <Input
              id="name"
              type="text"
              v-model="name"
              :aria-describedby="nameError && nameMeta.touched ? 'name-error' : undefined"
            />
            <p
              v-if="nameError && nameMeta.touched"
              id="name-error"
              class="text-destructive text-xs"
            >
              {{ nameError }}
            </p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="password">
              Defina uma senha <span class="text-destructive" aria-hidden="true">*</span>
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
            {{ isSubmitting ? 'Criando conta…' : 'Criar conta' }}
            <ArrowRight class="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>
      </div>
    </div>
  </div>
</template>
