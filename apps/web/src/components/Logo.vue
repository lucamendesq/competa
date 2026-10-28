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
    <img :src="file(surface === 'dark' ? 'white' : 'cobalt')" :alt="alt" class="h-full w-auto" />
  </div>
</template>
