<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter, onBeforeRouteLeave } from 'vue-router'
import {
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import PageHeader from '@/components/PageHeader.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingRows from '@/components/LoadingRows.vue'
import Modal from '@/components/Modal.vue'
import CatalogPicker, { type CatalogDocument } from '@/components/CatalogPicker.vue'
import { useTemplateDetailFeature, useDocumentTypesFeature, useChecklistsFeature } from '@/features/checklists/composables/useChecklistsFeature'
import { toast } from 'vue-sonner'
import { apiErrorMessage } from '@/api/error'

const props = defineProps<{ id: string }>()
const router = useRouter()

const { detailQuery, addItemMutation, updateItemMutation, removeItemMutation } = useTemplateDetailFeature(computed(() => props.id))
const { documentTypesQuery } = useDocumentTypesFeature(ref(1), ref(100))
const { renameTemplateMutation, deleteTemplateMutation } = useChecklistsFeature()

const CATEGORY_LABEL: Record<string, string> = {
  fiscal: 'Fiscal / Impostos',
  accounting: 'Contábil / Financeiro',
  payroll: 'Folha de Pagamento',
  legal: 'Societário / Legal',
}

type DraftItem = {
  id: string;
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: string;
  annualMonth: number | null;
  dueDay: number | null;
  dueMonthOffset: number;
  conditionFlag: string | null;
  required: boolean;
  added: boolean;
}

const draftName = ref('')
const draftItems = ref<DraftItem[]>([])
const removedIds = ref<string[]>([])

let nextTempId = 0

watch(() => detailQuery.data.value, (loaded) => {
  if (loaded) {
    draftName.value = loaded.name ?? ''
    draftItems.value = (loaded.items ?? []).map(item => ({ ...item, added: false }))
    removedIds.value = []
  }
}, { immediate: true })

const visibleItems = computed(() => draftItems.value.filter(item => !removedIds.value.includes(item.id)))

const savedMap = computed(() => {
  const items = detailQuery.data.value?.items ?? []
  return new Map(items.map(item => [item.id, item]))
})

function isDirty(item: DraftItem) {
  const original = savedMap.value.get(item.id)
  if (!original) return true
  return (
    original.periodicity !== item.periodicity ||
    original.annualMonth !== item.annualMonth ||
    original.dueDay !== item.dueDay ||
    original.dueMonthOffset !== item.dueMonthOffset ||
    original.conditionFlag !== item.conditionFlag ||
    original.required !== item.required
  )
}

const pendingCount = computed(() => {
  const renamed = draftName.value.trim() !== (detailQuery.data.value?.name ?? '') ? 1 : 0
  const touched = visibleItems.value.filter(item => isDirty(item)).length
  return renamed + touched + removedIds.value.length
})

const hasChanges = computed(() => pendingCount.value > 0)

const acting = ref(false)
const catalogOpen = ref(false)
const catalogSearch = ref('')
const confirmRemoval = ref<DraftItem | null>(null)
const confirmDelete = ref(false)

const available = computed(() => {
  const alreadyInTemplate = new Set(visibleItems.value.map((item) => item.documentTypeId))
  const term = catalogSearch.value.trim().toLowerCase()
  return (documentTypesQuery.data.value?.data ?? []).filter(
    (kind) => !alreadyInTemplate.has(kind.id) && (!term || kind.name.toLowerCase().includes(term))
  )
})

function patchItem(itemId: string, change: Partial<DraftItem>) {
  draftItems.value = draftItems.value.map(item => item.id === itemId ? { ...item, ...change } : item)
}

function changePeriodicity(item: DraftItem, value: string) {
  patchItem(item.id, {
    periodicity: value,
    annualMonth: value === 'annual' ? (item.annualMonth ?? 1) : null,
  })
}

function changeDay(item: DraftItem, value: string) {
  const dueDay = value === '' ? null : Number(value)
  if (dueDay !== null && (dueDay < 1 || dueDay > 31)) return
  patchItem(item.id, { dueDay })
}

function changeAnnualMonth(item: DraftItem, value: string) {
  patchItem(item.id, { annualMonth: Number(value) })
}

function changeCondition(item: DraftItem, value: string) {
  patchItem(item.id, { conditionFlag: value === '' ? null : value })
}

function toggleRequired(item: DraftItem) {
  patchItem(item.id, { required: !item.required })
}

function add(document: CatalogDocument) {
  nextTempId++
  draftItems.value.push({
    id: `novo-${nextTempId}`,
    documentTypeId: document.id,
    name: document.name,
    category: document.category,
    description: null,
    acceptedFormats: document.acceptedFormats,
    periodicity: 'monthly',
    annualMonth: null,
    dueDay: null,
    dueMonthOffset: 1,
    conditionFlag: null,
    required: true,
    added: true,
  })
  catalogOpen.value = false
  toast.success(`${document.name} entra no template quando você salvar.`)
}

function remove(item: DraftItem) {
  if (item.added) {
    draftItems.value = draftItems.value.filter(row => row.id !== item.id)
  } else {
    removedIds.value.push(item.id)
  }
  confirmRemoval.value = null
}

function discard() {
  const loaded = detailQuery.data.value
  if (loaded) {
    draftName.value = loaded.name ?? ''
    draftItems.value = (loaded.items ?? []).map(item => ({ ...item, added: false }))
    removedIds.value = []
  }
}

async function save() {
  if (!hasChanges.value) return
  acting.value = true

  try {
    const name = draftName.value.trim()
    if (name && name !== detailQuery.data.value?.name) {
      await renameTemplateMutation.mutateAsync({ id: props.id, name })
    }

    for (const itemId of removedIds.value) {
      await removeItemMutation.mutateAsync(itemId)
    }

    for (const item of visibleItems.value) {
      const scheduling = {
        periodicity: item.periodicity as any,
        annualMonth: item.annualMonth,
        dueDay: item.dueDay,
        dueMonthOffset: item.dueMonthOffset,
        conditionFlag: (item.conditionFlag ?? null) as any,
        required: item.required,
      }

      if (item.added) {
        await addItemMutation.mutateAsync({
          documentTypeId: item.documentTypeId,
          ...scheduling,
        })
      } else if (isDirty(item)) {
        await updateItemMutation.mutateAsync({
          itemId: item.id,
          body: scheduling,
        })
      }
    }

    toast.success('Template salvo.')
    detailQuery.refetch()
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível salvar o template.'))
    detailQuery.refetch()
  } finally {
    acting.value = false
  }
}

async function doDeleteTemplate() {
  acting.value = true
  try {
    await deleteTemplateMutation.mutateAsync(props.id)
    toast.success('Modelo excluído com sucesso.')
    confirmDelete.value = false
    router.push('/templates')
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível excluir o modelo.'))
  } finally {
    acting.value = false
  }
}

const leaveDecision = ref<((leave: boolean) => void) | null>(null)
const confirmingLeave = computed(() => leaveDecision.value !== null)

onBeforeRouteLeave((_to, _from, next) => {
  if (!hasChanges.value) {
    next()
    return
  }
  leaveDecision.value = (leave: boolean) => {
    next(leave)
  }
})

function resolveLeave(leave: boolean) {
  if (leaveDecision.value) {
    leaveDecision.value(leave)
  }
  leaveDecision.value = null
}
</script>

<template>
  <PageHeader
    title="Editar Checklist"
    :description="detailQuery.data.value?.accountingFirmId === null ? 'Este é um template padrão e não pode ser apagado, mas pode ser ajustado para o seu uso.' : 'Ajuste os documentos exigidos para empresas com este template.'"
  >
    <Button variant="outline" class="mr-2" @click="router.back()">Voltar</Button>
    <Button @click="catalogOpen = true">
      <Plus class="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar documento
    </Button>
  </PageHeader>

  <main class="mt-8">
    <template v-if="detailQuery.isLoading.value">
      <LoadingRows />
    </template>
    <template v-else-if="detailQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="detailQuery.refetch()" />
    </template>
    <template v-else>
      <div class="mb-6 flex flex-col gap-1.5">
        <label for="templateName" class="text-sm font-medium">Nome do template</label>
        <Input id="templateName" v-model="draftName" class="max-w-md" :disabled="detailQuery.data.value?.accountingFirmId === null" />
        <p v-if="detailQuery.data.value?.accountingFirmId === null" class="text-muted-foreground text-xs">Templates padrão não podem ser renomeados.</p>
      </div>

      <div class="flex flex-col gap-4 pb-24">
        <section v-for="item in visibleItems" :key="item.id" class="bg-card border-border rounded-xl border p-4 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div class="min-w-0 flex-1">
              <h3 class="text-base font-semibold">{{ item.name }}</h3>
              <p class="text-muted-foreground text-xs uppercase tracking-wider mt-1">{{ CATEGORY_LABEL[item.category] ?? item.category }}</p>
              <p v-if="item.description" class="text-muted-foreground mt-2 text-sm">{{ item.description }}</p>
            </div>
            <Button variant="ghost" size="icon" class="text-danger hover:text-danger hover:bg-danger/10" @click="confirmRemoval = item">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>

          <div class="border-border mt-4 flex flex-wrap gap-4 border-t pt-4">
            <div class="flex flex-col gap-1.5 min-w-[140px]">
              <label class="text-xs font-medium">Frequência</label>
              <select
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                :value="item.periodicity"
                @change="changePeriodicity(item, ($event.target as HTMLSelectElement).value)"
              >
                <option value="monthly">Mensal</option>
                <option value="annual">Anual</option>
                <option value="on_demand">Sob demanda</option>
              </select>
            </div>

            <template v-if="item.periodicity === 'monthly'">
              <div class="flex flex-col gap-1.5 min-w-[140px]">
                <label class="text-xs font-medium">Prazo (Dia)</label>
                <Input
                  type="number"
                  min="1"
                  max="31"
                  class="h-9 w-24"
                  placeholder="Livre"
                  :value="item.dueDay ?? ''"
                  @input="changeDay(item, ($event.target as HTMLInputElement).value)"
                />
              </div>
            </template>

            <template v-if="item.periodicity === 'annual'">
              <div class="flex flex-col gap-1.5 min-w-[140px]">
                <label class="text-xs font-medium">Mês do envio</label>
                <select
                  class="flex h-9 w-32 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  :value="item.annualMonth"
                  @change="changeAnnualMonth(item, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="1">Janeiro</option>
                  <option value="2">Fevereiro</option>
                  <option value="3">Março</option>
                  <option value="4">Abril</option>
                  <option value="5">Maio</option>
                  <option value="6">Junho</option>
                  <option value="7">Julho</option>
                  <option value="8">Agosto</option>
                  <option value="9">Setembro</option>
                  <option value="10">Outubro</option>
                  <option value="11">Novembro</option>
                  <option value="12">Dezembro</option>
                </select>
              </div>
            </template>

            <div class="flex flex-col gap-1.5 min-w-[180px]">
              <label class="text-xs font-medium">Condição (Opcional)</label>
              <select
                class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                :value="item.conditionFlag ?? ''"
                @change="changeCondition(item, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">Aplicar a todos</option>
                <option value="has_employees">Só se tiver funcionários</option>
                <option value="is_simples_nacional">Só para Simples Nacional</option>
                <option value="is_lucro_presumido">Só para Lucro Presumido</option>
              </select>
            </div>

            <div class="flex items-center gap-2 mt-6">
              <input
                type="checkbox"
                class="size-4"
                :checked="item.required"
                @change="toggleRequired(item)"
              />
              <label class="text-sm font-medium">Obrigatório</label>
            </div>
          </div>
        </section>

        <div v-if="visibleItems.length === 0" class="border-border rounded-xl border-2 border-dashed p-12 text-center">
          <p class="text-muted-foreground text-sm">Este template não possui documentos.</p>
        </div>

        <div v-if="!detailQuery.data.value?.accountingFirmId === null" class="mt-8 flex justify-end">
          <Button variant="ghost" class="text-danger hover:text-danger hover:bg-danger/10" @click="confirmDelete = true">
            Excluir template inteiro
          </Button>
        </div>
      </div>
    </template>
  </main>

  <!-- Sticky Footer Bar -->
  <div v-if="hasChanges" class="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)]">
    <div class="mx-auto flex max-w-5xl items-center justify-between">
      <span class="text-sm font-medium text-warning-foreground bg-warning-surface border border-warning-border rounded-full px-3 py-1">
        Alterações não salvas
      </span>
      <div class="flex items-center gap-2">
        <Button variant="ghost" :disabled="acting" @click="discard">Descartar</Button>
        <Button :disabled="acting" @click="save">{{ acting ? 'Salvando...' : 'Salvar template' }}</Button>
      </div>
    </div>
  </div>

  <Modal
    v-model:open="catalogOpen"
    title="Adicionar documento do catálogo"
  >
    <CatalogPicker
      :documents="available"
      v-model:search="catalogSearch"
      :acting="acting"
      empty-label="Todos os documentos aplicáveis já estão no template."
      @add="add"
    />
    <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="catalogOpen = false">Fechar</Button>
    </div>
  </Modal>

  <Modal
    :open="confirmRemoval !== null"
    @update:open="$event ? null : (confirmRemoval = null)"
    title="Remover documento?"
    description="O documento deixará de ser exigido de todas as empresas que usam este template."
  >
    <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="confirmRemoval = null">Cancelar</Button>
      <Button variant="destructive" @click="remove(confirmRemoval!)">Remover</Button>
    </div>
  </Modal>

  <Modal
    v-model:open="confirmDelete"
    title="Excluir template?"
    description="Isto deixará as empresas deste template sem checklist nas próximas competências."
  >
    <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="confirmDelete = false">Cancelar</Button>
      <Button variant="destructive" :disabled="acting" @click="doDeleteTemplate">Excluir</Button>
    </div>
  </Modal>

  <Modal
    v-model:open="confirmingLeave"
    title="Sair sem salvar?"
    description="Você possui alterações no template que não foram salvas."
  >
    <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="resolveLeave(false)">Ficar</Button>
      <Button variant="destructive" @click="resolveLeave(true)">Sair e descartar</Button>
    </div>
  </Modal>
</template>
