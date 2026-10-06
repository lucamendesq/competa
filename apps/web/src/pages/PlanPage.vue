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
  <div class="mx-auto max-w-3xl w-full">
    <div class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight">Plano e Assinatura</h1>
      <p class="text-muted-foreground mt-2">
        Gerencie o plano da sua Contabilidade e o acesso ao Competa.
      </p>
    </div>

    <Card>
      <CardHeader>
        <CardTitle class="flex items-center gap-2">
          <CreditCard class="h-5 w-5 text-primary" />
          Assinatura Atual
        </CardTitle>
        <CardDescription>
          Você está no plano
          <strong class="capitalize">{{ subscription?.planName || 'Essencial' }}</strong
          >.
        </CardDescription>
      </CardHeader>

      <CardContent class="space-y-6">
        <div class="flex items-center gap-4 rounded-lg border p-4 bg-muted/50">
          <div class="flex-1">
            <p class="text-sm font-medium text-muted-foreground">Status</p>
            <div class="flex items-center gap-2 mt-1">
              <CheckCircle2
                v-if="subscription?.status === 'ACTIVE'"
                class="h-5 w-5 text-green-500"
              />
              <AlertTriangle v-else-if="auth.isOverdue" class="h-5 w-5 text-destructive" />
              <div v-else class="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                <span class="text-white text-xs font-bold">T</span>
              </div>
              <p
                class="text-lg font-semibold"
                :class="{
                  'text-destructive': auth.isOverdue,
                  'text-green-600': subscription?.status === 'ACTIVE',
                }"
              >
                {{ statusLabel }}
              </p>
            </div>
          </div>
          <div class="flex-1" v-if="subscription?.status === 'trialing' && trialFormatted">
            <p class="text-sm font-medium text-muted-foreground">Encerramento do Trial</p>
            <p class="text-lg font-semibold mt-1">{{ trialFormatted }}</p>
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
          class="bg-destructive/10 text-destructive rounded-lg p-4 text-sm font-medium"
        >
          Seu acesso de escrita foi temporariamente suspenso devido a pendências na assinatura. As
          empresas ainda conseguem enviar documentos e você pode baixar arquivos já enviados.
        </div>
      </CardContent>

      <CardFooter
        v-if="subscription?.status === 'ACTIVE'"
        class="flex justify-end gap-3 border-t px-6 py-4"
      >
        <Button
          @click="goToCheckout(subscription?.planName || 'essencial')"
          :disabled="isLoading"
          class="w-full sm:w-auto min-w-[200px]"
        >
          <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
          Gerenciar Assinatura
        </Button>
      </CardFooter>
    </Card>

    <div v-if="subscription?.status !== 'ACTIVE'" class="mt-8">
      <h2 class="text-xl font-bold mb-4">Escolha o seu plano</h2>

      <div class="mt-8 grid gap-6 sm:grid-cols-2">
        <Card class="border-2 hover:border-primary transition-colors">
          <CardHeader>
            <CardTitle>Plano Essencial</CardTitle>
            <CardDescription>Para contabilidades iniciando a automação.</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-3xl font-bold">
              R$ 79<span class="text-sm font-normal text-muted-foreground">/mês</span>
            </p>
            <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
              <li class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-primary" /> Até 10 empresas
              </li>
              <li class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-primary" /> Histórico de documentos
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button @click="goToCheckout('essencial')" :disabled="isLoading" class="w-full">
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              Assinar Essencial
            </Button>
          </CardFooter>
        </Card>

        <Card class="border-2 border-primary relative">
          <div
            class="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-xs font-bold px-3 py-1 rounded-full"
          >
            Recomendado
          </div>
          <CardHeader>
            <CardTitle>Plano Profissional</CardTitle>
            <CardDescription>Para escalar sua operação sem limites.</CardDescription>
          </CardHeader>
          <CardContent>
            <p class="text-3xl font-bold">
              R$ 147<span class="text-sm font-normal text-muted-foreground">/mês</span>
            </p>
            <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
              <li class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-primary" /> Empresas ilimitadas
              </li>
              <li class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-primary" /> Cobrança via WhatsApp
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button @click="goToCheckout('profissional')" :disabled="isLoading" class="w-full">
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              Assinar Profissional
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  </div>
</template>
