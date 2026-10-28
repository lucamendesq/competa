<script setup lang="ts">
import { computed, ref } from 'vue';
import { CircleAlert, PartyPopper, Upload } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import StatusPill from '@/components/StatusPill.vue';
import { useContactPending } from '@/features/contact-area/composables/useContactPending';
import type { MyPendingItem } from '@/features/contact-area/api';
import { dateBr, isOverdue, monthLabel } from '@/utils/format';
import LoadingRows from '@/components/LoadingRows.vue';
import UploadFeedback from '@/components/UploadFeedback.vue';
import type { FileResult } from '@/composables/useUpload';
import { toast } from 'vue-sonner';

const { pendingQuery, sendFiles } = useContactPending();

const sendingItemId = ref<string | null>(null);
const results = ref<FileResult[] | null>(null);
const retryTarget = ref<{ requestId: string; itemId: string } | null>(null);

const triggerFileInput = (id: string) => {
  window.document.getElementById(`file-${id}`)?.click();
};

/** Foto do documento serve para qualquer item: o servidor aceita imagem além dos formatos
 *  do checklist, então o seletor também precisa oferecer. */
const acceptAttr = (formats?: string[]) =>
  [...new Set([...(formats ?? []).map((f) => `.${f}`), '.jpg', '.jpeg', '.png'])].join(',');

async function send(files: File[], requestId: string, itemId: string) {
  retryTarget.value = { requestId, itemId };
  sendingItemId.value = itemId;
  results.value = null;

  const res = await sendFiles(files, requestId, itemId);
  results.value = res;
  sendingItemId.value = null;

  if (res.every((r) => r.ok)) {
    toast.success(
      res.length === 1 ? 'Arquivo enviado com sucesso.' : `${res.length} arquivos enviados.`,
    );
  }
}

async function onPick(event: Event, requestId: string, itemId: string) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length) await send(files, requestId, itemId);
}

function retry(files: File[]) {
  const target = retryTarget.value;
  if (target) send(files, target.requestId, target.itemId);
}

const groupedItems = computed(() => {
  const items = pendingQuery.data.value || [];
  const groups = new Map<string, any>();

  for (const item of items) {
    const key = `${item.companyId}-${item.periodId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        companyName: item.companyName,
        referenceMonth: item.referenceMonth,
        requestId: item.requestId,
        items: [],
      });
    }
    groups.get(key).items.push(item);
  }

  return Array.from(groups.values());
});

/* A recusa devolve o item para `pending` (nunca fica `rejected`), e a lista vem da mais
 * antiga para a mais nova: o aviso olha se há recusa e o item ainda não foi reenviado, e
 * mostra o motivo da última. */
function latestRejection(item: MyPendingItem['item']) {
  if (item.status === 'submitted' || item.status === 'accepted') return undefined;
  return item.rejections[item.rejections.length - 1];
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <LoadingRows v-if="pendingQuery.isLoading.value" :count="4" />

    <div
      v-else-if="!groupedItems.length"
      class="bg-primary/10 border-primary/20 rounded-xl border p-5"
    >
      <div class="flex items-start gap-4">
        <PartyPopper class="text-primary mt-1 shrink-0" aria-hidden="true" />
        <div>
          <h1 class="text-foreground text-base font-semibold tracking-tight">
            Tudo certo por aqui!
          </h1>
          <p class="text-foreground/80 mt-1 text-sm">
            Nenhuma empresa sua tem documento pendente neste momento.
          </p>
        </div>
      </div>
    </div>

    <section v-for="group in groupedItems" :key="group.key" class="flex flex-col gap-3">
      <h2 class="font-display text-foreground text-base font-semibold tracking-tight">
        {{ group.companyName }}
        <span class="text-muted-foreground font-sans text-sm font-normal">
          — Competência {{ monthLabel(group.referenceMonth) }}
        </span>
      </h2>

      <ul
        class="bg-card border-border divide-border divide-y rounded-xl border shadow-sm"
        role="list"
      >
        <li
          v-for="row in group.items"
          :key="row.item.id"
          class="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
          :class="{
            'bg-amber-50/40': row.item.status === 'pending',
            'bg-rose-50/30': row.item.status === 'rejected',
          }"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="text-foreground truncate text-sm font-semibold">
                {{ row.item.name }}
              </span>
              <StatusPill :status="row.item.status" />
              <span
                v-if="row.item.status !== 'rejected' && isOverdue(row.item.dueDate)"
                class="text-danger-foreground border-danger-border bg-danger-surface inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
              >
                Atrasado
              </span>
            </div>

            <p v-if="row.item.description" class="text-muted-foreground mt-1 text-sm">
              {{ row.item.description }}
            </p>

            <p class="text-muted-foreground mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span v-if="row.item.dueDate">Prazo {{ dateBr(row.item.dueDate) }}</span>
              <span v-if="row.item.acceptedFormats?.length">
                Formatos: {{ row.item.acceptedFormats.join(', ').toUpperCase() }}
              </span>
            </p>

            <div
              v-if="latestRejection(row.item)"
              class="bg-danger-surface border-danger-border text-danger-foreground mt-3 flex gap-2.5 rounded-lg border p-3 text-sm"
            >
              <CircleAlert class="text-danger mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span class="font-semibold">Motivo da recusa:</span>
                {{ latestRejection(row.item)?.rejectionReason }}
              </span>
            </div>
          </div>

          <div class="shrink-0">
            <input
              type="file"
              :id="`file-${row.item.id}`"
              class="sr-only"
              multiple
              :accept="acceptAttr(row.item.acceptedFormats)"
              @change="onPick($event, group.requestId, row.item.id)"
            />
            <Button
              variant="outline"
              size="sm"
              class="w-full sm:w-auto"
              @click="triggerFileInput(row.item.id)"
            >
              <Upload class="mr-2 h-4 w-4" aria-hidden="true" />
              {{ sendingItemId === row.item.id ? 'Enviando…' : 'Enviar arquivos' }}
            </Button>
          </div>
        </li>
      </ul>
    </section>

    <UploadFeedback :results="results" @dismiss="results = null" @retry="retry" />
  </div>
</template>
