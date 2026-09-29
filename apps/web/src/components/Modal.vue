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

      <!-- Max height container to match the angular layout -->
      <div class="max-h-[70vh] overflow-y-auto pr-2">
        <slot></slot>
      </div>
    </DialogContent>
  </Dialog>
</template>
