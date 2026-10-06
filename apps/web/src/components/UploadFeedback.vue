<script setup lang="ts">
import { computed } from 'vue';
import { X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import Modal from './Modal.vue';
import type { FileResult } from '@/composables/useUpload';

const props = defineProps<{
  results: FileResult[] | null;
}>();

const emit = defineEmits<{
  dismiss: [];
  retry: [files: File[]];
}>();

const refusedFiles = computed(() => (props.results ?? []).filter((result) => !result.ok));

const retriable = computed(() =>
  refusedFiles.value.flatMap((result) => (result.retriable && result.file ? [result.file] : [])),
);

const sentCount = computed(() => (props.results ?? []).filter((result) => result.ok).length);

const isOpen = computed(() => refusedFiles.value.length > 0);

function onOpenChange(val: boolean) {
  if (!val) emit('dismiss');
}

const title = computed(() =>
  retriable.value.length === refusedFiles.value.length
    ? 'O envio não completou'
    : 'Alguns arquivos não foram aceitos',
);

const description = computed(() => {
  if (retriable.value.length === refusedFiles.value.length) {
    return refusedFiles.value.length === 1
      ? '1 arquivo não chegou'
      : `${refusedFiles.value.length} arquivos não chegaram`;
  }
  return refusedFiles.value.length === 1
    ? '1 arquivo precisa ser enviado de outra forma'
    : `${refusedFiles.value.length} arquivos precisam ser enviados de outra forma`;
});
</script>

<template>
  <Modal :open="isOpen" @update:open="onOpenChange" :title="title" :description="description">
    <ul class="divide-border divide-y" role="list">
      <li v-for="(result, index) in refusedFiles" :key="index" class="flex items-start gap-3 py-3">
        <X class="mt-0.5 shrink-0 text-base text-danger" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <p class="truncate text-sm font-medium">{{ result.fileName }}</p>
          <p class="mt-0.5 text-xs text-danger">{{ result.reason }}</p>
        </div>
      </li>
    </ul>

    <p v-if="sentCount" class="text-muted-foreground mt-4 text-sm">
      Os outros {{ sentCount }} chegaram e já estão na lista.
    </p>

    <div
      class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
    >
      <template v-if="retriable.length">
        <Button @click="emit('retry', retriable)"> Tentar de novo ({{ retriable.length }}) </Button>
        <Button variant="ghost" @click="emit('dismiss')">Deixar para depois</Button>
      </template>
      <template v-else>
        <Button @click="emit('dismiss')">Entendi</Button>
      </template>
    </div>
  </Modal>
</template>
