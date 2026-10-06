<script setup lang="ts">
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { computed } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  description?: string;
  wide?: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const internalOpen = computed({
  get: () => props.open,
  set: (val) => emit('update:open', val),
});
</script>

<template>
  <Dialog v-model:open="internalOpen">
    <DialogContent :class="wide ? 'max-w-5xl' : 'max-w-2xl'">
      <DialogHeader>
        <DialogTitle>{{ title }}</DialogTitle>
        <DialogDescription v-if="description">
          {{ description }}
        </DialogDescription>
      </DialogHeader>

      <div class="-mx-6 -mb-6 max-h-[70vh] overflow-x-hidden overflow-y-auto px-6 pb-6">
        <slot></slot>
      </div>
    </DialogContent>
  </Dialog>
</template>
