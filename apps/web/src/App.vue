<script setup lang="ts">
import { RouterView } from 'vue-router';
import { Toaster } from '@/components/ui/sonner';
</script>

<template>
  <RouterView />
  <Toaster richColors position="top-right" />
</template>
