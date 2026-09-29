<script setup lang="ts">
import { Search } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type CatalogDocument = {
  id: string;
  name: string;
  category: string;
  acceptedFormats: string[];
}

const CATEGORY_LABEL: Record<string, string> = {
  fiscal: 'Fiscal / Impostos',
  accounting: 'Contábil / Financeiro',
  payroll: 'Folha de Pagamento',
  legal: 'Societário / Legal',
}

withDefaults(defineProps<{
  documents: CatalogDocument[]
  search: string
  searchId?: string
  emptyLabel?: string
  acting?: boolean
}>(), {
  searchId: 'search-catalog',
  emptyLabel: 'Nenhum documento do catálogo fora desta lista.',
  acting: false
})

const emit = defineEmits<{
  'update:search': [value: string]
  'add': [document: CatalogDocument]
}>()
</script>

<template>
  <div>
    <div class="relative">
      <Label class="sr-only" :for="searchId">Buscar documento no catálogo</Label>
      <Input
        :id="searchId"
        type="search"
        class="pl-9"
        placeholder="Buscar documento"
        :model-value="search"
        @update:model-value="emit('update:search', $event as string)"
      />
      <Search
        class="text-muted-foreground pointer-events-none absolute top-3 left-3 text-base md:top-2.5"
        aria-hidden="true"
      />
    </div>

    <template v-if="!documents.length">
      <p class="text-muted-foreground mt-4 text-sm">{{ emptyLabel }}</p>
    </template>
    <template v-else>
      <ul class="divide-border mt-4 divide-y" role="list">
        <li v-for="document in documents" :key="document.id" class="flex flex-wrap items-center justify-between gap-3 py-3">
          <div class="min-w-0">
            <p class="text-sm font-medium">{{ document.name }}</p>
            <p class="text-muted-foreground mt-0.5 text-xs">
              {{ CATEGORY_LABEL[document.category] }} &middot;
              {{ document.acceptedFormats.join(', ') }}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="acting"
            @click="emit('add', document)"
          >
            Adicionar
          </Button>
        </li>
      </ul>
    </template>
  </div>
</template>
