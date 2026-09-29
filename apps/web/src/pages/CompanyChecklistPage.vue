<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import {
  RotateCcw,
  Plus,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import PageHeader from '@/components/PageHeader.vue'
import ErrorState from '@/components/ErrorState.vue'
import LoadingRows from '@/components/LoadingRows.vue'
import Modal from '@/components/Modal.vue'
import StatusPill from '@/components/StatusPill.vue'
import CatalogPicker, { type CatalogDocument } from '@/components/CatalogPicker.vue'
import { useCompanyDetailFeature, useCompanyChecklistFeature } from '@/features/companies/composables/useCompaniesFeature'
import { useDocumentTypesFeature } from '@/features/checklists/composables/useChecklistsFeature'
import { toast } from 'vue-sonner'
import { apiErrorMessage } from '@/api/error'

const props = defineProps<{ id: string }>()
const route = useRoute()
const created = computed(() => route.query.created === '1' || route.query.created === 'true')

const { detailQuery } = useCompanyDetailFeature(computed(() => props.id))
const { effectiveChecklistQuery, overridesQuery, saveOverrideMutation, removeOverrideMutation } = useCompanyChecklistFeature(computed(() => props.id))
const { documentTypesQuery } = useDocumentTypesFeature(ref(1), ref(100))

const CATEGORY_LABEL: Record<string, string> = {
  fiscal: 'Fiscal / Impostos',
  accounting: 'Contábil / Financeiro',
  payroll: 'Folha de Pagamento',
  legal: 'Societário / Legal',
}

const PERIODICITY_LABEL: Record<string, string> = {
  monthly: 'Mensal',
  annual: 'Anual',
  on_demand: 'Sob demanda',
}

const catalogOpen = ref(false)
const catalogSearch = ref('')
const acting = ref(false)
const confirmRestore = ref(false)

type DisplayRow = {
  documentTypeId: string;
  name: string;
  category: string;
  description: string | null;
  acceptedFormats: string[];
  periodicity: string;
  dueDay: number | null;
  included: boolean;
  source: 'template' | 'adicionado' | 'removido';
  applicable: boolean;
  conditionFlag: string | null;
}

const lines = computed<DisplayRow[]>(() => {
  const effective = effectiveChecklistQuery.data.value?.items ?? []
  const removed = (overridesQuery.data.value ?? []).filter(o => o.action === 'remove')

  const fromEffective: DisplayRow[] = effective.map((item) => ({
    documentTypeId: item.documentTypeId,
    name: item.name,
    category: item.category,
    description: item.description,
    acceptedFormats: item.acceptedFormats,
    periodicity: item.periodicity,
    dueDay: item.dueDay,
    included: true,
    source: item.source === 'override' ? 'adicionado' : 'template',
    applicable: item.applies,
    conditionFlag: item.conditionFlag,
  }))

  const fromRemoved: DisplayRow[] = removed.map((override) => ({
    documentTypeId: override.documentTypeId,
    name: override.name,
    category: override.category,
    description: override.description,
    acceptedFormats: override.acceptedFormats,
    periodicity: override.periodicity ?? 'monthly',
    dueDay: override.dueDay,
    included: false,
    source: 'removido',
    applicable: true,
    conditionFlag: override.conditionFlag,
  }))

  return [...fromEffective, ...fromRemoved].sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  )
})

const groups = computed(() => {
  const byCategory = new Map<string, DisplayRow[]>()
  for (const line of lines.value) {
    byCategory.set(line.category, [...(byCategory.get(line.category) ?? []), line])
  }
  return Array.from(byCategory.entries())
})

const custom = computed(() => (overridesQuery.data.value ?? []).length > 0)

const available = computed(() => {
  const alreadyInChecklist = new Set(lines.value.map(line => line.documentTypeId))
  const term = catalogSearch.value.trim().toLowerCase()

  return (documentTypesQuery.data.value?.data ?? []).filter(
    (kind) => !alreadyInChecklist.has(kind.id) && (!term || kind.name.toLowerCase().includes(term))
  )
})

async function toggle(line: DisplayRow) {
  acting.value = true
  try {
    if (line.source === 'template') {
      await saveOverrideMutation.mutateAsync({
        documentTypeId: line.documentTypeId,
        action: 'remove',
        periodicity: 'monthly',
        dueMonthOffset: 1,
        required: true,
      })
      toast.success(`${line.name} saiu do checklist desta empresa.`)
    } else {
      await removeOverrideMutation.mutateAsync(line.documentTypeId)
      toast.success(
        line.source === 'removido'
          ? `${line.name} voltou para o checklist.`
          : `${line.name} foi removido do checklist.`
      )
    }
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível alterar o checklist.'))
  } finally {
    acting.value = false
  }
}

async function add(document: CatalogDocument) {
  acting.value = true
  try {
    await saveOverrideMutation.mutateAsync({
      documentTypeId: document.id,
      action: 'add',
      periodicity: 'monthly',
      dueMonthOffset: 1,
      required: true,
    })
    toast.success(`${document.name} adicionado ao checklist.`)
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível adicionar o documento.'))
  } finally {
    acting.value = false
  }
}

async function restoreDefault() {
  acting.value = true
  try {
    const promises = (overridesQuery.data.value ?? []).map((override) => 
      removeOverrideMutation.mutateAsync(override.documentTypeId)
    )
    await Promise.all(promises)
    toast.success('Checklist restaurado para o padrão do template.')
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível restaurar o padrão.'))
  } finally {
    acting.value = false
    confirmRestore.value = false
  }
}
</script>

<template>
  <PageHeader
    :title="'Checklist de ' + (detailQuery.data.value?.name ?? '')"
    :description="effectiveChecklistQuery.data.value?.template
      ? 'Baseado no template ' + effectiveChecklistQuery.data.value.template.name
      : 'Documentos avulsos desta empresa (sem template).'"
  >
    <Button v-if="custom && effectiveChecklistQuery.data.value?.template" variant="ghost" @click="confirmRestore = true">
      <RotateCcw class="mr-2 h-4 w-4" aria-hidden="true" /> Restaurar padrão do template
    </Button>
    <Button @click="catalogOpen = true">
      <Plus class="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar documento
    </Button>
    <Button variant="outline" as-child>
      <RouterLink :to="`/empresas/${id}/editar`">Voltar para a empresa</RouterLink>
    </Button>
  </PageHeader>

  <section v-if="created" class="mt-8 flex flex-wrap items-center gap-3 rounded-xl border border-info-border bg-info-surface p-4" role="status">
    <div class="min-w-0 flex-1">
      <h2 class="text-sm font-semibold text-info-foreground">Empresa cadastrada. Falta um ajuste?</h2>
      <p class="mt-0.5 text-xs text-info-foreground">
        Este é o checklist que vai ser cobrado todo mês. Remova o que esta empresa não tem e
        adicione o que faltar — sem precisar criar um template novo.
      </p>
    </div>
    <Button variant="outline" size="sm" as-child>
      <RouterLink to="/empresas">Está bom assim</RouterLink>
    </Button>
  </section>

  <main class="mt-8">
    <template v-if="effectiveChecklistQuery.isLoading.value">
      <LoadingRows :count="8" />
    </template>
    <template v-else-if="effectiveChecklistQuery.isError.value">
      <ErrorState message="Não conseguimos carregar o checklist." @retry="effectiveChecklistQuery.refetch()" />
    </template>
    <template v-else>
      <div class="flex flex-col gap-4">
        <section v-for="[category, groupLines] in groups" :key="category" class="bg-card border-border rounded-xl border">
          <h2 class="border-border border-b p-4 text-sm font-semibold">
            {{ CATEGORY_LABEL[category] ?? category }}
            <span class="text-muted-foreground font-normal">({{ groupLines.length }})</span>
          </h2>

          <ul class="divide-border divide-y" role="list">
            <li v-for="line in groupLines" :key="line.documentTypeId" class="flex flex-wrap items-start gap-3 p-4">
              <button
                type="button"
                role="switch"
                :aria-checked="line.included"
                class="focus-visible:ring-ring relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
                :class="line.included ? 'bg-primary' : 'bg-muted border-border border'"
                :disabled="acting"
                @click="toggle(line)"
              >
                <span class="sr-only">{{ line.included ? 'Remover' : 'Incluir' }} {{ line.name }}</span>
                <span
                  class="bg-card size-4 rounded-full shadow transition-transform"
                  :class="line.included ? 'translate-x-6' : 'translate-x-1'"
                ></span>
              </button>

              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <p
                    class="text-sm font-medium"
                    :class="{ 'line-through text-muted-foreground': line.source === 'removido' }"
                  >
                    {{ line.name }}
                  </p>

                  <StatusPill v-if="line.source === 'removido'" status="removed" />
                  <StatusPill v-else-if="line.source === 'adicionado'" status="added" />
                  <StatusPill v-if="!line.applicable" status="not_applicable" :title="'Só entra se a característica ' + line.conditionFlag + ' estiver ligada'" />
                </div>

                <p v-if="line.description" class="text-muted-foreground mt-1 text-xs">{{ line.description }}</p>

                <div class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span class="flex flex-wrap gap-1">
                    <span v-for="format in line.acceptedFormats" :key="format" class="bg-muted rounded-full px-2 py-0.5 font-medium">
                      {{ format }}
                    </span>
                  </span>
                  <span class="text-muted-foreground">{{ PERIODICITY_LABEL[line.periodicity] }}</span>
                  <span v-if="line.dueDay" class="text-muted-foreground tabular-nums">
                    Vence no dia {{ line.dueDay }}
                  </span>
                </div>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </main>

  <Modal
    v-model:open="catalogOpen"
    title="Adicionar documento do catálogo"
    description="Documentos fora do template base desta empresa."
  >
    <CatalogPicker
      :documents="available"
      v-model:search="catalogSearch"
      :acting="acting"
      empty-label="Nenhum documento do catálogo fora deste checklist."
      @add="add"
    />
    <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="catalogOpen = false">Fechar</Button>
    </div>
  </Modal>

  <Modal
    v-model:open="confirmRestore"
    title="Restaurar padrão do template?"
    description="Todos os ajustes desta empresa serão descartados."
  >
    <p class="text-sm">
      O checklist volta a ser exatamente o do template
      <strong>{{ effectiveChecklistQuery.data.value?.template?.name }}</strong>. Competências já abertas não mudam.
    </p>

    <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="confirmRestore = false">Cancelar</Button>
      <Button variant="destructive" :disabled="acting" @click="restoreDefault">
        Restaurar padrão
      </Button>
    </div>
  </Modal>
</template>
