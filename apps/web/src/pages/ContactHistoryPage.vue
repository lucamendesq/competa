<script setup lang="ts">
import { ref } from 'vue';
import { ChevronDown, Download, Eye, File as FileIcon, History } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import StatusPill from '@/components/StatusPill.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import ErrorState from '@/components/ErrorState.vue';
import {
  downloadMyDocument,
  openMyDocument,
  type MyDocument,
  type MyPeriod,
} from '@/features/contact-area/api';
import {
  useContactHistory,
  useContactPeriod,
} from '@/features/contact-area/composables/useContactHistory';
import { apiErrorMessage } from '@/api/error';
import { dateBr, fileSize, monthLabel } from '@/utils/format';
import { displayItemStatus } from '@/utils/item-status';

const { page, pageCount, periodsQuery } = useContactHistory();

const selected = ref<{ periodId: string; companyId: string } | null>(null);
const periodQuery = useContactPeriod(selected);

const isSelected = (row: MyPeriod) =>
  selected.value?.periodId === row.periodId && selected.value?.companyId === row.companyId;

function toggle(row: MyPeriod) {
  selected.value = isSelected(row) ? null : { periodId: row.periodId, companyId: row.companyId };
}

async function openDocument(doc: MyDocument) {
  try {
    const { objectUrl } = await openMyDocument(doc.id);
    window.open(objectUrl, '_blank', 'noopener');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível abrir o documento.'));
  }
}

async function downloadDocument(doc: MyDocument) {
  try {
    await downloadMyDocument(doc.id, doc.fileName);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o documento.'));
  }
}
</script>

<template>
  <div class="space-y-6">
    <div>
      <h1 class="text-2xl font-bold tracking-tight font-display text-foreground">Histórico</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Consulte as competências anteriores e os documentos enviados pela sua empresa.
      </p>
    </div>

    <LoadingRows v-if="periodsQuery.isLoading.value" :count="4" />

    <ErrorState
      v-else-if="periodsQuery.isError.value"
      message="Confira sua conexão e tente de novo."
      @retry="periodsQuery.refetch()"
    />

    <div
      v-else-if="!periodsQuery.data.value?.data.length"
      class="bg-card border-border rounded-xl border p-12 text-center text-sm text-muted-foreground shadow-sm"
    >
      <div
        class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <History class="size-6" aria-hidden="true" />
      </div>
      <p class="font-medium text-foreground">Nenhuma competência por aqui ainda.</p>
    </div>

    <template v-else>
      <ul class="flex flex-col gap-3" role="list">
        <li
          v-for="row in periodsQuery.data.value.data"
          :key="row.requestId"
          class="bg-card border-border rounded-xl border shadow-sm"
        >
          <button
            type="button"
            class="hover:bg-muted/40 focus-visible:ring-ring flex w-full items-center justify-between gap-4 rounded-xl p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:outline-none"
            :aria-expanded="isSelected(row)"
            :aria-controls="'period-' + row.requestId"
            @click="toggle(row)"
          >
            <span class="min-w-0 flex-1">
              <span class="flex flex-wrap items-center gap-2">
                <span class="text-foreground text-sm font-semibold">
                  {{ monthLabel(row.referenceMonth) }}
                </span>
                <StatusPill :status="row.requestStatus" />
              </span>
              <span class="text-muted-foreground mt-1 block text-xs">
                {{ row.companyName }} · {{ row.itemCount - row.pendingCount }} de
                {{ row.itemCount }} itens aprovados · {{ row.deliveredCount }}
                {{ row.deliveredCount === 1 ? 'arquivo enviado' : 'arquivos enviados' }}
              </span>
            </span>
            <ChevronDown
              class="text-muted-foreground size-4 shrink-0 transition-transform"
              :class="{ 'rotate-180': isSelected(row) }"
              aria-hidden="true"
            />
          </button>

          <div
            v-if="isSelected(row)"
            :id="'period-' + row.requestId"
            class="border-border border-t p-4"
          >
            <LoadingRows v-if="periodQuery.isLoading.value" :count="3" />
            <ErrorState
              v-else-if="periodQuery.isError.value"
              message="Confira sua conexão e tente de novo."
              @retry="periodQuery.refetch()"
            />
            <div v-else-if="periodQuery.data.value" class="flex flex-col gap-4">
              <section v-for="item in periodQuery.data.value.items" :key="item.id">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-foreground text-sm font-semibold">{{ item.name }}</h2>
                  <StatusPill :status="displayItemStatus(item)" />
                </div>
                <p v-if="!item.documents.length" class="text-muted-foreground mt-1 text-xs">
                  Nenhum arquivo enviado.
                </p>
                <ul
                  v-else
                  class="border-border mt-2 divide-y rounded-lg border bg-white"
                  role="list"
                >
                  <li
                    v-for="doc in item.documents"
                    :key="doc.id"
                    class="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center"
                  >
                    <div class="flex min-w-0 flex-1 items-start gap-2">
                      <FileIcon
                        class="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div class="min-w-0">
                        <p class="text-foreground truncate font-medium">{{ doc.fileName }}</p>
                        <p class="text-muted-foreground text-xs">
                          {{ fileSize(doc.sizeBytes) }} · {{ dateBr(doc.uploadedAt) }}
                          <template v-if="doc.uploadedByName"> · {{ doc.uploadedByName }}</template>
                        </p>
                        <p
                          v-if="doc.reviewStatus === 'rejected' && doc.rejectionReason"
                          class="text-danger-foreground mt-1 text-xs"
                        >
                          Motivo da recusa: {{ doc.rejectionReason }}
                        </p>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <StatusPill :status="doc.reviewStatus" />
                      <Button
                        variant="outline"
                        size="sm"
                        :aria-label="`Ver ${doc.fileName}`"
                        @click="openDocument(doc)"
                      >
                        <Eye class="h-4 w-4" aria-hidden="true" />
                        Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        :aria-label="`Baixar ${doc.fileName}`"
                        @click="downloadDocument(doc)"
                      >
                        <Download class="h-4 w-4" aria-hidden="true" />
                        Baixar
                      </Button>
                    </div>
                  </li>
                </ul>
              </section>

              <section v-if="periodQuery.data.value.extraDocuments.length">
                <h2 class="text-foreground text-sm font-semibold">Documentos extras</h2>
                <ul class="border-border mt-2 divide-y rounded-lg border bg-white" role="list">
                  <li
                    v-for="doc in periodQuery.data.value.extraDocuments"
                    :key="doc.id"
                    class="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center"
                  >
                    <div class="flex min-w-0 flex-1 items-start gap-2">
                      <FileIcon
                        class="text-muted-foreground mt-0.5 h-4 w-4 shrink-0"
                        aria-hidden="true"
                      />
                      <div class="min-w-0">
                        <p class="text-foreground truncate font-medium">{{ doc.fileName }}</p>
                        <p class="text-muted-foreground text-xs">
                          {{ fileSize(doc.sizeBytes) }} · {{ dateBr(doc.uploadedAt) }}
                        </p>
                      </div>
                    </div>
                    <div class="flex shrink-0 items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        :aria-label="`Ver ${doc.fileName}`"
                        @click="openDocument(doc)"
                      >
                        <Eye class="h-4 w-4" aria-hidden="true" />
                        Ver
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        :aria-label="`Baixar ${doc.fileName}`"
                        @click="downloadDocument(doc)"
                      >
                        <Download class="h-4 w-4" aria-hidden="true" />
                        Baixar
                      </Button>
                    </div>
                  </li>
                </ul>
              </section>
            </div>
          </div>
        </li>
      </ul>

      <nav
        v-if="pageCount > 1"
        class="flex items-center justify-between gap-3"
        aria-label="Paginação do histórico"
      >
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page -= 1">
          Mais recentes
        </Button>
        <span class="text-muted-foreground text-xs">Página {{ page }} de {{ pageCount }}</span>
        <Button variant="outline" size="sm" :disabled="page >= pageCount" @click="page += 1">
          Anteriores
        </Button>
      </nav>
    </template>
  </div>
</template>
