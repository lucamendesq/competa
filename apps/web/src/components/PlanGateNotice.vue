<script setup lang="ts">
import { computed } from 'vue';
import { PLANS, planRequiredFor, type PlanCapability } from '@competa/contracts';
import { Lock } from 'lucide-vue-next';

const props = defineProps<{ capability: PlanCapability }>();

const plan = computed(() => PLANS[planRequiredFor(props.capability)]);
</script>

<template>
  <p class="text-muted-foreground flex items-center gap-1.5 text-xs">
    <Lock class="size-3.5 shrink-0" aria-hidden="true" />
    <span>
      <slot>Este recurso</slot> está disponível a partir do plano
      <strong class="text-foreground">{{ plan.label }}</strong
      >.
      <RouterLink
        :to="{ path: '/configuracoes/plano', query: { plano: plan.name } }"
        class="text-primary font-medium underline underline-offset-2"
      >
        Ver planos
      </RouterLink>
    </span>
  </p>
</template>
