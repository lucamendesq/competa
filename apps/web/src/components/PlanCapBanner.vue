<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { PLANS } from '@competa/contracts';
import Callout from '@/components/Callout.vue';
import { usePlanUsage } from '@/features/companies/composables/usePlanUsage';
import { brl } from '@/utils/format';

const { data } = usePlanUsage();

const usage = computed(() => data.value);
const currentPlan = computed(
  () => PLANS[usage.value?.planName as keyof typeof PLANS] ?? PLANS.trial,
);
const recommended = computed(() => PLANS[usage.value?.recommendedPlan ?? 'profissional']);

const perCompany = computed(() =>
  brl(recommended.value.priceMonthly / recommended.value.companyCap),
);
</script>

<template>
  <Callout v-if="usage?.overCap" tone="warning" heading="Você passou do teto do seu plano">
    <p>
      Você tem <strong>{{ usage.companiesActive }} empresas ativas</strong> e o
      {{ currentPlan.label }} cobre {{ usage.companyCap }}. O cadastro continua liberado até
      {{ usage.softCap }} empresas ativas.
    </p>
    <p class="mt-1">
      O {{ recommended.label }} sai a {{ perCompany }} por empresa — cobre até
      {{ recommended.companyCap }}.
    </p>

    <template #actions>
      <RouterLink
        :to="{ path: '/configuracoes/plano', query: { plano: usage.recommendedPlan } }"
        class="self-center rounded-md border border-warning-border px-3 py-1.5 text-sm font-semibold whitespace-nowrap underline-offset-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        Ver o {{ recommended.label }}
      </RouterLink>
    </template>
  </Callout>
</template>
