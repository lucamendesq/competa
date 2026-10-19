<script setup lang="ts">
import { computed, ref } from 'vue';
import { Upload, Bell, CircleAlert } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useContactPending } from '@/features/contact-area/composables/useContactPending';
import { dateBr, monthLabel } from '@/utils/format';
import { isOverdue } from '@/utils/format';
import UploadFeedback from '@/components/UploadFeedback.vue';

const { pendingQuery, sendFiles } = useContactPending();

// Upload state per item
const uploadingItemId = ref<string | null>(null);
const uploadResults = ref<any[] | null>(null);

const triggerFileInput = (id: string) => {
  window.document.getElementById(`file-${id}`)?.click();
};

/** Foto do documento serve para qualquer item: o servidor aceita imagem além dos formatos
 *  do checklist, então o seletor também precisa oferecer. */
const acceptAttr = (formats?: string[]) =>
  [...new Set([...(formats ?? []).map((f) => `.${f}`), '.jpg', '.jpeg', '.png'])].join(',');

const handleFileUpload = async (e: Event, requestId: string, itemId: string) => {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;

  uploadingItemId.value = itemId;
  uploadResults.value = null;

  const results = await sendFiles(Array.from(input.files), requestId, itemId);
  uploadResults.value = results;

  // reset input
  input.value = '';
};

const groupedItems = computed(() => {
  const items = pendingQuery.data.value || [];
  const groups = new Map<string, any>();

  for (const item of items) {
    const key = `${item.companyId}-${item.periodId}`;
    if (!groups.has(key)) {
      groups.set(key, {
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
</script>

<template>
  <div class="space-y-6">
    <div v-if="pendingQuery.isLoading.value" class="text-center py-16 text-muted-foreground font-medium">
      Carregando pendências...
    </div>

    <div
      v-else-if="!groupedItems.length"
      class="bg-card border border-border rounded-xl p-10 text-center shadow-sm"
    >
      <div
        class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <Bell class="h-6 w-6" />
      </div>
      <h2 class="text-xl font-bold font-display text-foreground">Tudo certo por aqui!</h2>
      <p class="text-muted-foreground mt-2 max-w-md mx-auto text-sm">
        Nenhuma empresa possui documentos pendentes para envio neste momento.
      </p>
    </div>

    <div v-else class="space-y-8">
      <div v-for="group in groupedItems" :key="group.requestId" class="space-y-4">
        <h2 class="text-lg font-bold font-display tracking-tight text-foreground flex flex-wrap items-center gap-2">
          {{ group.companyName }}
          <span class="text-muted-foreground font-normal text-sm font-sans"
            >— Competência {{ monthLabel(group.referenceMonth) }}</span
          >
        </h2>

        <Card
          v-for="row in group.items"
          :key="row.item.id"
          class="border border-border bg-card shadow-sm rounded-xl"
        >
          <CardContent class="p-5 sm:p-6">
            <div class="flex flex-col sm:flex-row gap-6 justify-between items-start">
              <div class="space-y-2 flex-1">
                <div class="flex flex-wrap items-center gap-2.5">
                  <h3 class="font-semibold text-foreground font-display text-base">
                    {{ row.item.name }}
                  </h3>
                  <span
                    v-if="row.item.status === 'rejected'"
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-rose-200 bg-rose-50 text-rose-800"
                  >
                    Recusado
                  </span>
                  <span
                    v-else-if="isOverdue(row.item.dueDate)"
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-amber-200 bg-amber-50 text-amber-800"
                  >
                    Atrasado
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border border-slate-200 bg-slate-100 text-slate-700"
                  >
                    Pendente
                  </span>
                </div>

                <p v-if="row.item.description" class="text-sm text-muted-foreground">
                  {{ row.item.description }}
                </p>

                <div class="text-xs text-muted-foreground flex flex-wrap gap-4 pt-1">
                  <span v-if="row.item.dueDate">Prazo: {{ dateBr(row.item.dueDate) }}</span>
                  <span v-if="row.item.acceptedFormats?.length">
                    Formatos: {{ row.item.acceptedFormats.join(', ').toUpperCase() }}
                  </span>
                </div>

                <div
                  v-if="row.item.status === 'rejected' && row.item.rejections?.[0]"
                  class="mt-4 p-3.5 bg-danger-surface border border-danger-border rounded-lg text-danger-foreground text-sm flex gap-2.5"
                >
                  <CircleAlert class="h-4 w-4 shrink-0 mt-0.5 text-danger-accent" />
                  <div>
                    <p class="font-semibold">Motivo da recusa:</p>
                    <p class="mt-0.5">{{ row.item.rejections[0].reason }}</p>
                  </div>
                </div>

                <div v-if="uploadingItemId === row.item.id && uploadResults" class="mt-4">
                  <UploadFeedback :results="uploadResults" />
                </div>
              </div>

              <div class="shrink-0 w-full sm:w-auto">
                <input
                  type="file"
                  :id="`file-${row.item.id}`"
                  class="hidden"
                  multiple
                  :accept="acceptAttr(row.item.acceptedFormats)"
                  @change="handleFileUpload($event, group.requestId, row.item.id)"
                />
                <Button
                  variant="outline"
                  class="w-full sm:w-auto hover:bg-primary/5 hover:text-primary hover:border-primary/40 focus-visible:ring-ring focus-visible:border-primary"
                  @click="triggerFileInput(row.item.id)"
                  :disabled="uploadingItemId === row.item.id && !uploadResults"
                >
                  <Upload class="h-4 w-4 mr-2" />
                  {{
                    uploadingItemId === row.item.id && !uploadResults
                      ? 'Enviando...'
                      : 'Enviar arquivos'
                  }}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
