<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTitle } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { PAID_PLANS, PLANS, type PlanName } from '@competa/contracts';
import { api } from '@/api/client';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-vue-next';

useTitle('Plano e Assinatura | Competa');

const auth = useAuthStore();
const isLoading = ref(false);
const simulatedCheckout = ref(false);

const subscription = computed(() => auth.accountant?.accountingFirm.subscription);

const currentPlan = computed(
  () => PLANS[(subscription.value?.planName ?? 'trial') as PlanName] ?? PLANS.trial,
);

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const statusLabel = computed(() => {
  if (!subscription.value) return 'Desconhecido';
  const { status, trialEndsAt } = subscription.value;

  if (status === 'ACTIVE') return 'Ativa';
  if (status === 'OVERDUE') return 'Atrasada';
  if (status === 'CANCELED') return 'Cancelada';
  if (status === 'trialing') {
    if (trialEndsAt && new Date(trialEndsAt) < new Date()) return 'Trial Expirado';
    return 'Trial';
  }
  return status;
});

const trialFormatted = computed(() => {
  const dateStr = subscription.value?.trialEndsAt;
  if (!dateStr) return null;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(new Date(dateStr));
});

async function goToCheckout(planName: string) {
  isLoading.value = true;
  simulatedCheckout.value = false;
  try {
    const { checkoutUrl, simulated } = await api.post<{
      checkoutUrl: string;
      simulated: boolean;
    }>('/billing/checkout', { planName });

    if (simulated || !checkoutUrl) {
      simulatedCheckout.value = true;
      toast.info('Pagamento simulado: nenhuma cobrança foi criada neste ambiente.');
      return;
    }

    window.location.href = checkoutUrl;
  } catch (error) {
    toast.error(
      apiErrorMessage(error, 'Não foi possível gerar o link de pagamento. Tente novamente.'),
    );
  } finally {
    isLoading.value = false;
  }
}
</script>

<template>
  <div class="mx-auto max-w-5xl w-full">
    <div class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight font-display text-foreground">Plano e Assinatura</h1>
      <p class="text-muted-foreground mt-2">
        Gerencie o plano da sua Contabilidade e o acesso ao Competa.
      </p>
    </div>

    <Card class="border border-border shadow-sm rounded-xl">
      <CardHeader>
        <CardTitle class="flex items-center gap-2 font-display">
          <CreditCard class="h-5 w-5 text-primary" />
          Assinatura Atual
        </CardTitle>
        <CardDescription>
          Você está no plano <strong>{{ currentPlan.label }}</strong> — até
          {{ currentPlan.companyCap }} empresas, contadores ilimitados.
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-6">
        <div class="flex items-center gap-4 rounded-xl border border-border p-4 bg-muted/30">
          <div class="flex-1">
            <p class="text-sm font-medium text-muted-foreground">Status</p>
            <div class="flex items-center gap-2 mt-1">
              <CheckCircle2
                v-if="subscription?.status === 'ACTIVE'"
                class="h-5 w-5 text-emerald-600"
              />
              <AlertTriangle v-else-if="auth.isOverdue" class="h-5 w-5 text-destructive" />
              <div v-else class="h-5 w-5 rounded-full bg-sky-600 flex items-center justify-center">
                <span class="text-white text-xs font-bold">T</span>
              </div>
              <p
                class="text-lg font-semibold"
                :class="{
                  'text-destructive': auth.isOverdue,
                  'text-emerald-700 font-bold': subscription?.status === 'ACTIVE',
                }"
              >
                {{ statusLabel }}
              </p>
            </div>
          </div>
          <div class="flex-1" v-if="subscription?.status === 'trialing' && trialFormatted">
            <p class="text-sm font-medium text-muted-foreground">Encerramento do Trial</p>
            <p class="text-lg font-semibold text-foreground mt-1">{{ trialFormatted }}</p>
          </div>
        </div>

        <div
          v-if="simulatedCheckout"
          class="bg-warning-surface text-warning-foreground border border-warning-border rounded-lg p-4 text-sm font-medium"
        >
          Ambiente sem gateway de pagamento: a assinatura foi registrada apenas no log do servidor e
          <strong>nenhuma cobrança real foi criada</strong>. Em produção este botão leva ao checkout
          do Asaas.
        </div>

        <div
          v-if="auth.isOverdue"
          class="bg-danger-surface border border-danger-border text-danger-foreground rounded-lg p-4 text-sm font-medium"
        >
          Seu acesso de escrita foi temporariamente suspenso devido a pendências na assinatura. As
          empresas ainda conseguem enviar documentos e você pode baixar arquivos já enviados.
        </div>
      </CardContent>

      <CardFooter
        v-if="subscription?.status === 'ACTIVE'"
        class="flex justify-end gap-3 border-t border-border px-6 py-4"
      >
        <Button
          @click="goToCheckout(currentPlan.name === 'trial' ? 'essencial' : currentPlan.name)"
          :disabled="isLoading"
          class="w-full sm:w-auto min-w-[200px]"
        >
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          Gerenciar Assinatura
        </Button>
      </CardFooter>
    </Card>

    <div v-if="subscription?.status !== 'ACTIVE'" class="mt-8">
      <h2 class="text-xl font-bold font-display text-foreground mb-4">Escolha o seu plano</h2>

      <p class="text-muted-foreground mb-6 text-sm">
        O preço é por Contabilidade e a conta é por <strong>empresa ativa cadastrada</strong> —
        nunca por usuário. Todo plano inclui contadores ilimitados.
      </p>

      <div class="mt-8 grid gap-6 sm:grid-cols-3">
        <Card
          v-for="plan in PAID_PLANS"
          :key="plan.name"
          class="border relative flex flex-col transition-all duration-150 rounded-xl"
          :class="
            plan.name === 'profissional'
              ? 'border-primary ring-2 ring-primary/20 shadow-md'
              : 'border-border hover:border-primary/50 shadow-sm'
          "
        >
          <div
            v-if="plan.name === 'profissional'"
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full shadow-xs tracking-wide"
          >
            Recomendado
          </div>
          <CardHeader>
            <CardTitle class="font-display">Plano {{ plan.label }}</CardTitle>
            <CardDescription>{{ plan.pitch }}</CardDescription>
          </CardHeader>
          <CardContent class="flex-1">
            <p class="text-3xl font-bold font-display text-foreground">
              {{ brl(plan.priceMonthly)
              }}<span class="text-sm font-normal text-muted-foreground font-sans">/mês</span>
            </p>
            <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
              <li v-for="item in plan.highlights" :key="item" class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-primary shrink-0" /> {{ item }}
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button @click="goToCheckout(plan.name)" :disabled="isLoading" class="w-full">
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              Assinar {{ plan.label }}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  </div>
</template>
