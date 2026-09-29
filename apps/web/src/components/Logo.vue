<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    variant?: 'icon' | 'horizontal';
    surface?: 'auto' | 'dark';
    alt?: string;
  }>(),
  {
    variant: 'horizontal',
    surface: 'auto',
    alt: 'Competa',
  },
);

const file = (tone: 'cobalt' | 'white') => `/brand/logo-${props.variant}-${tone}.svg`;
</script>

<template>
  <div class="inline-block">
    <template v-if="surface === 'dark'">
      <img :src="file('white')" :alt="alt" class="h-full w-auto" />
    </template>
    <template v-else>
      <img :src="file('cobalt')" :alt="alt" class="h-full w-auto dark:hidden" />
      <img :src="file('white')" :alt="alt" class="hidden h-full w-auto dark:block" />
    </template>
  </div>
</template>
