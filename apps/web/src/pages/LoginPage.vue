<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useForm, useField } from 'vee-validate'
import * as z from 'zod'
import { toTypedSchema } from '@vee-validate/zod'
import {
  ArrowRight,
  CircleAlert,
  Download,
  Link,
  Zap,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import Logo from '@/components/Logo.vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()
const router = useRouter()

const error = ref<string | null>(null)

const LoginForm = z.object({
  email: z.string().trim().email('E-mail inválido.').min(1, 'Informe seu e-mail.'),
  password: z.string().min(1, 'Informe sua senha.')
})

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: toTypedSchema(LoginForm)
})

const { value: email, errorMessage: emailError, meta: emailMeta } = useField<string>('email')
const { value: password, errorMessage: passwordError, meta: passwordMeta } = useField<string>('password')

const benefits = [
  {
    icon: Zap,
    title: 'Abra a competência com 1 clique',
    text: 'Uma solicitação por empresa ativa, com o checklist e os prazos já congelados.',
  },
  {
    icon: Link,
    title: 'Seu cliente envia sem senha e sem cadastro',
    text: 'O Responsável recebe um link de upload com validade e escopo só de envio.',
  },
  {
    icon: Download,
    title: 'Baixe tudo organizado em zip',
    text: 'Por empresa e competência, ou a competência inteira de uma vez.',
  },
]

const onSubmit = handleSubmit(async (values) => {
  error.value = null
  try {
    await authStore.signInAccountant(values.email, values.password)
    router.push('/competencias')
  } catch (err: any) {
    error.value = err.message || 'E-mail ou senha inválidos.'
  }
})
</script>

<template>
  <div class="bg-muted/40 min-h-dvh lg:grid lg:grid-cols-2">
    <section class="bg-sidebar text-sidebar-foreground hidden flex-col justify-center p-12 lg:flex">
      <Logo surface="dark" class="h-10 text-white" />
      <p class="mt-6 max-w-md text-3xl font-semibold tracking-tight">
        Pare de garimpar documento no WhatsApp.
      </p>
      <p class="mt-3 max-w-md text-sm opacity-80">
        Defina o checklist mensal de cada empresa, abra a competência e receba tudo organizado — sem cobrar documento um por um.
      </p>

      <ul class="mt-10 flex max-w-md flex-col gap-6">
        <li v-for="item in benefits" :key="item.title" class="flex gap-4">
          <span class="bg-sidebar-accent flex size-9 shrink-0 items-center justify-center rounded-lg" aria-hidden="true">
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
        <h1 class="text-xl font-semibold tracking-tight">Acessar painel do Contador</h1>
        <p class="text-muted-foreground mt-1 text-sm">
          Informe suas credenciais para gerenciar suas competências.
        </p>

        <div v-if="error" class="mt-6 flex gap-3 rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground" role="alert">
          <CircleAlert class="mt-0.5 shrink-0 text-base h-4 w-4" aria-hidden="true" />
          <p>{{ error }}</p>
        </div>

        <form class="mt-6 flex flex-col gap-4" @submit="onSubmit">
          <div class="flex flex-col gap-1.5">
            <Label for="email">
              E-mail <span class="text-destructive" aria-hidden="true">*</span>
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
            <p v-if="emailError && emailMeta.touched" id="email-error" class="text-destructive text-xs">
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
              autocomplete="current-password"
              v-model="password"
              :aria-describedby="passwordError && passwordMeta.touched ? 'password-error' : undefined"
            />
            <p v-if="passwordError && passwordMeta.touched" id="password-error" class="text-destructive text-xs">
              {{ passwordError }}
            </p>
          </div>

          <Button size="lg" type="submit" class="mt-2 w-full" :disabled="isSubmitting">
            {{ isSubmitting ? 'Entrando…' : 'Entrar' }}
            <ArrowRight class="ml-2 h-4 w-4" aria-hidden="true" />
          </Button>
        </form>

        <p class="text-muted-foreground mt-6 text-center text-sm">
          <RouterLink to="/esqueci-senha" class="text-primary font-medium hover:underline">
            Esqueci minha senha
          </RouterLink>
        </p>

        <p class="text-muted-foreground mt-3 text-center text-sm">
          Recebeu convite de outro contador? Use o link do convite que chegou no seu e-mail.
        </p>

        <p class="text-muted-foreground mt-3 border-t pt-4 text-center text-sm">
          Você envia documentos para uma contabilidade?
          <RouterLink to="/perdi-meu-link" class="text-primary font-medium hover:underline">
            Perdi meu link
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
