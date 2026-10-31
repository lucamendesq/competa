<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useTitle } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Cnpj,
  PAID_PLANS,
  PLANS,
  planPrice,
  type BillingCycle,
  type PaidPlanName,
  type Plan,
  type PlanName,
} from '@competa/contracts';
import { useQuery } from '@tanstack/vue-query';
import { cancelSubscription, checkout, getSubscription } from '@/features/billing/api/billing';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import PlanCapBanner from '@/components/PlanCapBanner.vue';
import Callout from '@/components/Callout.vue';
import { usePlanUsage } from '@/features/companies/composables/usePlanUsage';
import { Loader2, CreditCard, AlertTriangle, CheckCircle2 } from 'lucide-vue-next';

useTitle('Plano e Assinatura | Competa');

const auth = useAuthStore();
const route = useRoute();
const isLoading = ref(false);
const cancelling = ref(false);
const isOwner = computed(() => auth.accountant?.accountant.owner === true);

/** Vem do CTA do banner de excedente: o tier recomendado chega já destacado. */
const highlighted = computed(() => (route.query.plano as string | undefined) ?? 'profissional');
const simulatedCheckout = ref(false);

const subscription = computed(() => auth.accountant?.accountingFirm.subscription);

/** O link da fatura em aberto vem daqui (só para o dono): é por ele que a firma bloqueada
 *  paga, e o botão "Assinar" não serve para quem já tem um boleto esperando. */
const billingQuery = useQuery({ queryKey: ['billingSubscription'], queryFn: getSubscription });
const invoiceUrl = computed(() => billingQuery.data.value?.invoiceUrl ?? null);
const pendingPlan = computed(() => {
  const name = billingQuery.data.value?.pendingPlanName;
  return name ? (PLANS[name as PlanName]?.label ?? name) : null;
});

/** O gateway exige o documento do pagador: sem CNPJ gravado, o checkout pede antes. */
const firmCnpj = computed(() => auth.accountant?.accountingFirm.cnpj ?? null);
const cnpjDraft = ref('');
const cnpjError = ref<string | null>(null);

const currentPlan = computed(
  () => PLANS[(subscription.value?.planName ?? 'trial') as PlanName] ?? PLANS.trial,
);

const cycle = ref<BillingCycle>('monthly');
const yearly = computed(() => cycle.value === 'yearly');

/** Oferta Fundador: o fundador vê o preço dele, não o público. */
const priceOverride = computed(() => subscription.value?.priceOverride ?? null);
const priceOf = (plan: Plan) =>
  planPrice(plan, cycle.value, priceOverride.value?.[plan.name as PaidPlanName]);
const monthlyOf = (plan: Plan) =>
  priceOverride.value?.[plan.name as PaidPlanName] ?? plan.priceMonthly;

const brl = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const { data: usageData } = usePlanUsage();
const usage = computed(() => usageData.value);

const isCurrent = (plan: Plan) =>
  subscription.value?.status === 'ACTIVE' && subscription.value.planName === plan.name;

/** As 8 linhas da D18, as mesmas da página pública. Disponibilidade nunca é só cor. */
const COMPARISON: { label: string; value: (plan: Plan) => string }[] = [
  { label: 'Preço por mês', value: (plan) => brl(monthlyOf(plan)) },
  { label: 'Empresas ativas', value: (plan) => `até ${plan.companyCap}` },
  { label: 'Contadores da equipe', value: () => '✓ Ilimitados' },
  { label: 'WhatsApp oficial no seu número', value: () => '✓ Sim' },
  {
    label: 'Lembretes automáticos',
    value: (plan) =>
      plan.capabilities.includes('reminderTuning')
        ? '✓ Cadência configurável'
        : '✓ Cadência padrão',
  },
  {
    label: 'Sua marca no link e nos e-mails',
    value: (plan) => (plan.capabilities.includes('branding') ? '✓ Sim' : '— Não'),
  },
  {
    label: 'Download em zip',
    value: (plan) =>
      plan.capabilities.includes('periodZip')
        ? '✓ Por empresa e da competência inteira'
        : '✓ Por empresa',
  },
  { label: 'Histórico dos documentos', value: () => '✓ 5 anos' },
];

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

const longDate = (dateStr: string) =>
  new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' }).format(
    new Date(dateStr),
  );

const trialFormatted = computed(() => {
  const dateStr = subscription.value?.trialEndsAt;
  return dateStr ? longDate(dateStr) : null;
});

/** Até quando o acesso vale: cancelada ou ativa, é o fim do período já pago. */
const periodEndFormatted = computed(() => {
  const dateStr = billingQuery.data.value?.currentPeriodEnd;
  return dateStr ? longDate(dateStr) : null;
});

const canCancel = computed(
  () =>
    isOwner.value &&
    (subscription.value?.status === 'ACTIVE' || subscription.value?.status === 'OVERDUE'),
);

async function cancelPlan() {
  if (
    !window.confirm(
      'Cancelar a assinatura? O acesso continua até o fim do período já pago; depois disso a escrita é bloqueada e as empresas continuam conseguindo enviar.',
    )
  ) {
    return;
  }

  cancelling.value = true;
  try {
    await cancelSubscription();
    toast.success('Assinatura cancelada.');
    await Promise.all([auth.reloadAccountant(), billingQuery.refetch()]);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível cancelar a assinatura.'));
  } finally {
    cancelling.value = false;
  }
}

async function goToCheckout(planName: string) {
  cnpjError.value = null;
  let cnpj: string | undefined;
  if (!firmCnpj.value) {
    const parsed = Cnpj.safeParse(cnpjDraft.value);
    if (!parsed.success) {
      cnpjError.value = parsed.error.issues[0]?.message ?? 'CNPJ inválido.';
      return;
    }
    cnpj = parsed.data;
  }

  isLoading.value = true;
  simulatedCheckout.value = false;
  try {
    const { checkoutUrl, simulated, applied } = await checkout({
      planName: planName as PaidPlanName,
      cycle: cycle.value,
      cnpj,
    });

    if (applied) {
      toast.success('Plano atualizado. A próxima fatura já sai no valor novo.');
      await Promise.all([auth.reloadAccountant(), billingQuery.refetch()]);
      return;
    }

    if (simulated) {
      simulatedCheckout.value = true;
      toast.info('Pagamento simulado: nenhuma cobrança foi criada neste ambiente.');
      await Promise.all([auth.reloadAccountant(), billingQuery.refetch()]);
      return;
    }

    /* Troca registrada sem fatura para pagar agora: vale na próxima cobrança. */
    if (!checkoutUrl) {
      toast.success('Troca registrada: vale a partir da próxima fatura.');
      await Promise.all([auth.reloadAccountant(), billingQuery.refetch()]);
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
      <h1 class="text-3xl font-bold tracking-tight font-display text-foreground">
        Plano e Assinatura
      </h1>
      <p class="text-muted-foreground mt-2">
        Gerencie o plano da sua Contabilidade e o acesso ao Competa.
      </p>
    </div>

    <PlanCapBanner class="mb-6" />

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
          <div
            class="flex-1"
            v-if="
              (subscription?.status === 'ACTIVE' || subscription?.status === 'CANCELED') &&
              periodEndFormatted
            "
          >
            <p class="text-sm font-medium text-muted-foreground">
              {{ subscription?.status === 'CANCELED' ? 'Acesso até' : 'Período pago até' }}
            </p>
            <p class="text-lg font-semibold text-foreground mt-1">{{ periodEndFormatted }}</p>
          </div>
          <div class="flex-1" v-if="usage">
            <p class="text-sm font-medium text-muted-foreground">Empresas ativas</p>
            <p
              class="text-lg font-semibold mt-1"
              :class="usage.overCap ? 'text-warning-foreground' : 'text-foreground'"
            >
              {{ usage.companiesActive }} de {{ usage.companyCap }}
            </p>
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

        <div
          v-if="invoiceUrl"
          class="flex flex-col gap-3 rounded-lg border border-primary/40 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-foreground">
            <template v-if="pendingPlan">
              Fatura do plano <strong>{{ pendingPlan }}</strong> aguardando pagamento.
            </template>
            <template v-else>Há uma fatura em aberto na sua assinatura.</template>
            Boleto, Pix ou cartão: a escolha é na página da fatura.
          </p>
          <Button as="a" :href="invoiceUrl" target="_blank" rel="noopener">Pagar fatura</Button>
        </div>
      </CardContent>

      <CardFooter v-if="canCancel" class="justify-end">
        <Button variant="ghost" size="sm" :disabled="cancelling" @click="cancelPlan">
          Cancelar assinatura
        </Button>
      </CardFooter>
    </Card>

    <div class="mt-8">
      <h2 class="text-xl font-bold font-display text-foreground mb-4">
        {{ subscription?.status === 'ACTIVE' ? 'Mudar de plano' : 'Escolha o seu plano' }}
      </h2>

      <p class="text-muted-foreground mb-6 text-sm">
        O preço é por Contabilidade e a conta é por <strong>empresa ativa cadastrada</strong> —
        nunca por usuário. Todo plano inclui contadores ilimitados.
      </p>

      <div
        class="inline-flex rounded-lg border border-border bg-card p-1"
        role="group"
        aria-label="Ciclo de cobrança"
      >
        <button
          v-for="option in ['monthly', 'yearly'] as BillingCycle[]"
          :key="option"
          type="button"
          class="rounded-md px-4 py-1.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          :class="
            cycle === option
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-pressed="cycle === option"
          @click="cycle = option"
        >
          {{ option === 'monthly' ? 'Mensal' : 'Anual' }}
          <span v-if="option === 'yearly'" class="ml-1 font-semibold">· 2 meses grátis</span>
        </button>
      </div>

      <p class="text-muted-foreground mt-3 text-sm">
        O anual é cobrado de uma vez, em boleto com Pix no QR Code.
        <strong>Não existe assinatura mensal no Pix</strong> — no mensal o pagamento é no cartão ou
        por boleto avulso.
      </p>

      <div v-if="!firmCnpj" class="mt-6 flex max-w-sm flex-col gap-1.5">
        <Label for="checkoutCnpj">CNPJ da Contabilidade</Label>
        <Input
          id="checkoutCnpj"
          v-model="cnpjDraft"
          inputmode="numeric"
          placeholder="00.000.000/0001-00"
        />
        <p class="text-muted-foreground text-xs">
          A fatura é emitida no CNPJ do escritório. Fica gravado nas configurações.
        </p>
        <p v-if="cnpjError" class="text-danger text-xs">{{ cnpjError }}</p>
      </div>

      <div class="mt-8 grid gap-6 sm:grid-cols-3">
        <Card
          v-for="plan in PAID_PLANS"
          :key="plan.name"
          class="border relative flex flex-col transition-all duration-150 rounded-xl"
          :class="
            plan.name === highlighted
              ? 'border-primary ring-2 ring-primary/20 shadow-md'
              : 'border-border hover:border-primary/50 shadow-sm'
          "
        >
          <div
            v-if="plan.name === highlighted"
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
              {{ brl(priceOf(plan))
              }}<span class="text-sm font-normal text-muted-foreground font-sans">{{
                yearly ? '/ano' : '/mês'
              }}</span>
            </p>
            <p v-if="yearly" class="text-muted-foreground mt-1 text-sm">
              Equivale a {{ brl(priceOf(plan) / 12) }}/mês — economia de
              <strong>{{ brl(monthlyOf(plan) * 12 - priceOf(plan)) }}</strong> no ano.
            </p>
            <p
              v-if="priceOverride?.[plan.name as PaidPlanName]"
              class="mt-1 text-sm font-semibold text-primary"
            >
              Preço de fundador, vitalício (público:
              {{ brl(planPrice(plan, cycle)) }}{{ yearly ? '/ano' : '/mês' }}).
            </p>
            <ul class="mt-4 space-y-2 text-sm text-muted-foreground">
              <li v-for="item in plan.highlights" :key="item" class="flex items-center gap-2">
                <CheckCircle2 class="h-4 w-4 text-primary shrink-0" /> {{ item }}
              </li>
            </ul>
          </CardContent>
          <CardFooter>
            <Button
              @click="goToCheckout(plan.name)"
              :disabled="isLoading || isCurrent(plan)"
              class="w-full"
            >
              <Loader2 v-if="isLoading" class="mr-2 h-4 w-4 animate-spin" />
              {{ isCurrent(plan) ? 'Plano atual' : `Assinar ${plan.label}` }}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <section class="mt-10">
        <h3 class="font-display text-base font-semibold text-foreground">
          O que muda entre os planos
        </h3>
        <div class="border-border mt-3 overflow-x-auto rounded-xl border">
          <table class="w-full min-w-[560px] text-left text-sm">
            <caption class="sr-only">
              Comparativo dos planos Essencial, Profissional e Escritório
            </caption>
            <thead>
              <tr class="border-border bg-muted/40 border-b">
                <th scope="col" class="text-foreground px-4 py-3 font-semibold">&nbsp;</th>
                <th
                  v-for="plan in PAID_PLANS"
                  :key="plan.name"
                  scope="col"
                  class="px-4 py-3 font-semibold"
                  :class="plan.name === highlighted ? 'text-primary' : 'text-foreground'"
                >
                  {{ plan.label }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in COMPARISON"
                :key="row.label"
                class="border-border/60 border-b last:border-0"
              >
                <th scope="row" class="text-foreground px-4 py-3 font-medium">{{ row.label }}</th>
                <td
                  v-for="plan in PAID_PLANS"
                  :key="plan.name"
                  class="text-muted-foreground px-4 py-3"
                >
                  {{ row.value(plan) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div class="mt-8 grid gap-4 md:grid-cols-2">
        <section class="border-border rounded-xl border p-4">
          <h3 class="text-foreground text-sm font-semibold">Contadores ilimitados, de verdade</h3>
          <p class="text-muted-foreground mt-1 text-sm">
            Toda suíte cobra por usuário. Um escritório de 4 pessoas paga cerca de R$200/mês no Omie
            G-Click <strong class="text-foreground">só em assentos</strong>. Aqui, a 5ª pessoa da
            equipe custa R$0, em qualquer plano.
          </p>
        </section>
        <section class="border-border rounded-xl border p-4">
          <h3 class="text-foreground text-sm font-semibold">
            {{ brl(PLANS.profissional.priceMonthly / PLANS.profissional.companyCap) }} por cliente
          </h3>
          <p class="text-muted-foreground mt-1 text-sm">
            No Profissional, {{ brl(PLANS.profissional.priceMonthly) }} dividido por
            {{ PLANS.profissional.companyCap }} empresas dá
            <strong class="text-foreground"
              >{{ brl(PLANS.profissional.priceMonthly / PLANS.profissional.companyCap) }} por
              empresa/mês</strong
            >, contra um honorário de R$300 a R$500 que você cobra de cada uma.
          </p>
        </section>
      </div>

      <Callout tone="warning" heading="O WhatsApp é cobrado pela Meta, não por nós" class="mt-8">
        A integração é no seu próprio número: você conecta sua conta oficial e a
        <strong>Meta cobra você direto</strong>, sem intermediário nem margem nossa. No uso típico
        de um escritório pequeno isso fica em <strong>R$10 a R$20/mês</strong>, e esse valor
        <strong>não está incluído</strong> no preço do Competa.
      </Callout>
    </div>
  </div>
</template>
