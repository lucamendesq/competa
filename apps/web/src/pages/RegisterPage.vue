<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useForm, useField } from 'vee-validate';
import * as z from 'zod';
import { email as emailSchema } from '@competa/contracts';
import { toTypedSchema } from '@vee-validate/zod';
import { ArrowLeft, ArrowRight, CircleAlert, Check, Building2, Zap, Download, Link as LinkIcon } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/Logo.vue';
import { useAuthStore } from '@/stores/auth';
import { apiErrorMessage } from '@/api/error';

const authStore = useAuthStore();
const router = useRouter();

const currentStep = ref<1 | 2>(1);
const submitError = ref<string | null>(null);

const RegisterFormSchema = z.object({
  userName: z.string().trim().min(1, 'Informe seu nome completo.'),
  email: emailSchema().min(1, 'Informe seu e-mail.'),
  password: z.string().min(8, 'A senha precisa de pelo menos 8 caracteres.'),
  firmName: z.string().trim().min(1, 'Informe o nome da sua contabilidade.'),
});

const { handleSubmit, isSubmitting, setFieldTouched, validateField } = useForm({
  validationSchema: toTypedSchema(RegisterFormSchema),
  initialValues: {
    userName: '',
    email: '',
    password: '',
    firmName: '',
  },
});

const { value: userName, errorMessage: userNameError, meta: userNameMeta } = useField<string>('userName');
const { value: email, errorMessage: emailError, meta: emailMeta } = useField<string>('email');
const { value: password, errorMessage: passwordError, meta: passwordMeta } = useField<string>('password');
const { value: firmName, errorMessage: firmNameError, meta: firmNameMeta } = useField<string>('firmName');

const benefits = [
  {
    icon: Zap,
    title: 'Teste grátis de 14 dias',
    text: 'Acesso completo a todos os recursos, sem necessidade de cartão de crédito.',
  },
  {
    icon: LinkIcon,
    title: 'Seus clientes enviam sem senha',
    text: 'Links diretos para upload, sem barreiras de login para o responsável da empresa.',
  },
  {
    icon: Download,
    title: 'Chega de garimpar no WhatsApp',
    text: 'Documentos recebidos e agrupados em zip por empresa e competência.',
  },
];

async function nextStep() {
  submitError.value = null;
  setFieldTouched('userName', true);
  setFieldTouched('email', true);
  setFieldTouched('password', true);

  const [nameRes, emailRes, passRes] = await Promise.all([
    validateField('userName'),
    validateField('email'),
    validateField('password'),
  ]);

  if (nameRes.valid && emailRes.valid && passRes.valid) {
    currentStep.value = 2;
  }
}

function prevStep() {
  submitError.value = null;
  currentStep.value = 1;
}

const onSubmit = handleSubmit(async (values) => {
  submitError.value = null;
  try {
    await authStore.registerFirm({
      userName: values.userName,
      email: values.email,
      password: values.password,
      firmName: values.firmName,
    });
    router.push('/competencias');
  } catch (err: any) {
    submitError.value = apiErrorMessage(
      err,
      'Não foi possível criar a conta. Verifique os dados e tente novamente.',
    );
  }
});
</script>

<template>
  <div class="bg-background min-h-dvh lg:grid lg:grid-cols-2">
    <section class="bg-[#0F172A] text-white hidden flex-col justify-center p-12 lg:flex">
      <Logo surface="dark" class="h-10 text-white" />
      <p class="font-display mt-6 max-w-md text-3xl font-semibold tracking-tight">
        Comece seu teste grátis de 14 dias.
      </p>
      <p class="mt-3 max-w-md text-sm opacity-80">
        Automatize a coleta mensal de documentos da sua contabilidade em poucos minutos.
      </p>

      <ul class="mt-10 flex max-w-md flex-col gap-6">
        <li v-for="item in benefits" :key="item.title" class="flex gap-4">
          <span
            class="bg-white/10 text-amber-400 flex size-9 shrink-0 items-center justify-center rounded-lg"
            aria-hidden="true"
          >
            <component :is="item.icon" class="text-base h-5 w-5" />
          </span>
          <span>
            <span class="block text-sm font-semibold">{{ item.title }}</span>
            <span class="mt-0.5 block text-sm opacity-75">{{ item.text }}</span>
          </span>
        </li>
      </ul>
    </section>

    <main class="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <div class="bg-card border-border w-full max-w-md rounded-xl border p-6 shadow-sm sm:p-8">
        <div class="mb-6 flex justify-center lg:hidden">
          <Logo class="h-8" />
        </div>
        <div class="mb-6 flex items-center justify-between">
          <div>
            <h1 class="font-display text-xl font-semibold tracking-tight">Criar conta</h1>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ currentStep === 1 ? 'Passo 1 de 2: Seus dados de acesso' : 'Passo 2 de 2: Sua contabilidade' }}
            </p>
          </div>
          <div class="flex items-center gap-1.5">
            <span
              class="flex size-7 items-center justify-center rounded-full text-xs font-semibold"
              :class="currentStep === 1 ? 'bg-primary text-primary-foreground' : 'bg-primary/15 text-primary'"
            >
              1
            </span>
            <span class="bg-border h-0.5 w-4"></span>
            <span
              class="flex size-7 items-center justify-center rounded-full text-xs font-semibold"
              :class="currentStep === 2 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'"
            >
              2
            </span>
          </div>
        </div>

        <div
          v-if="submitError"
          class="mb-6 flex gap-3 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
          role="alert"
        >
          <CircleAlert class="mt-0.5 shrink-0 text-base h-4 w-4" aria-hidden="true" />
          <p>{{ submitError }}</p>
        </div>

        <form novalidate @submit="onSubmit">
          <div v-show="currentStep === 1" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <Label for="user-name">
                Seu nome completo <span class="text-destructive" aria-hidden="true">*</span>
                <span class="sr-only">(obrigatório)</span>
              </Label>
              <Input
                id="user-name"
                type="text"
                autocomplete="name"
                placeholder="Ex.: Carlos Mendes"
                v-model="userName"
                :aria-describedby="userNameError && userNameMeta.touched ? 'user-name-error' : undefined"
              />
              <p
                v-if="userNameError && userNameMeta.touched"
                id="user-name-error"
                class="text-destructive text-xs"
              >
                {{ userNameError }}
              </p>
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="email">
                Seu e-mail profissional <span class="text-destructive" aria-hidden="true">*</span>
                <span class="sr-only">(obrigatório)</span>
              </Label>
              <Input
                id="email"
                type="email"
                autocomplete="email"
                inputmode="email"
                placeholder="contador@escritorio.com.br"
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

            <div class="flex flex-col gap-1.5">
              <Label for="password">
                Senha <span class="text-destructive" aria-hidden="true">*</span>
                <span class="sr-only">(obrigatório)</span>
              </Label>
              <Input
                id="password"
                type="password"
                autocomplete="new-password"
                placeholder="Mínimo de 8 caracteres"
                v-model="password"
                :aria-describedby="passwordError && passwordMeta.touched ? 'password-error' : undefined"
              />
              <p
                v-if="passwordError && passwordMeta.touched"
                id="password-error"
                class="text-destructive text-xs"
              >
                {{ passwordError }}
              </p>
            </div>

            <Button
              type="button"
              size="lg"
              class="mt-2 w-full"
              @click="nextStep"
            >
              Continuar
              <ArrowRight class="ml-2 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>

          <div v-show="currentStep === 2" class="flex flex-col gap-4">
            <div class="flex flex-col gap-1.5">
              <Label for="firm-name">
                Nome da Contabilidade <span class="text-destructive" aria-hidden="true">*</span>
                <span class="sr-only">(obrigatório)</span>
              </Label>
              <Input
                id="firm-name"
                type="text"
                autocomplete="organization"
                placeholder="Ex.: Mendes & Silva Contabilidade"
                v-model="firmName"
                :aria-describedby="firmNameError && firmNameMeta.touched ? 'firm-name-error' : undefined"
              />
              <p
                v-if="firmNameError && firmNameMeta.touched"
                id="firm-name-error"
                class="text-destructive text-xs"
              >
                {{ firmNameError }}
              </p>
            </div>

            <div class="bg-muted/50 border-border rounded-lg border p-4 text-xs text-muted-foreground">
              <div class="flex items-center gap-2 font-medium text-foreground">
                <Building2 class="h-4 w-4 text-primary" />
                <span>Conta master e titularidade</span>
              </div>
              <p class="mt-1">
                Você será cadastrado como o proprietário da contabilidade e poderá convidar outros contadores da sua equipe depois.
              </p>
            </div>

            <div class="mt-2 flex gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                class="flex-1"
                @click="prevStep"
                :disabled="isSubmitting"
              >
                <ArrowLeft class="mr-2 h-4 w-4" aria-hidden="true" />
                Voltar
              </Button>
              <Button
                type="submit"
                size="lg"
                class="flex-1"
                :disabled="isSubmitting"
              >
                {{ isSubmitting ? 'Criando conta…' : 'Criar conta' }}
                <Check v-if="!isSubmitting" class="ml-2 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </form>

        <p class="text-muted-foreground mt-6 text-center text-sm">
          Já tem uma conta?
          <RouterLink to="/entrar" class="text-primary font-medium hover:underline">
            Entrar
          </RouterLink>
        </p>

        <p class="text-muted-foreground mt-4 text-center text-xs">
          <RouterLink to="/termos" class="hover:underline">Termos de Uso</RouterLink>
          &middot;
          <RouterLink to="/privacidade" class="hover:underline">Privacidade</RouterLink>
        </p>
      </div>
    </main>
  </div>
</template>
