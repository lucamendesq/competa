<script setup lang="ts">
import type { PrimitiveProps } from 'reka-ui';
import type { HTMLAttributes } from 'vue';
import { computed } from 'vue';
import type { ButtonVariants } from '.';
import { Primitive } from 'reka-ui';
import { cn } from '@/utils/utils';
import { buttonVariants } from '.';
import { isBusy } from '@/api/busy';

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant'];
  size?: ButtonVariants['size'];
  class?: HTMLAttributes['class'];
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  as: 'button',
});

/* Navegação (`as-child` com RouterLink) continua livre: só o que dispara requisição
 * trava enquanto há escrita em voo. */
const blocked = computed(
  () => props.disabled || (isBusy.value && !props.asChild && props.as === 'button'),
);
</script>

<template>
  <Primitive
    data-slot="button"
    :data-variant="variant"
    :data-size="size"
    :as="as"
    :as-child="asChild"
    :disabled="blocked || undefined"
    :aria-disabled="blocked || undefined"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
  </Primitive>
</template>
