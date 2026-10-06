<script setup lang="ts">
import { computed, ref } from 'vue';
import { Upload, Bell, CircleAlert } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useContactPending } from '@/features/contact-area/composables/useContactPending';
import { dateBr, monthLabel } from '@/utils/format';
import { isOverdue } from '@/utils/format';
import UploadFeedback from '@/components/UploadFeedback.vue';

const { pendingQuery, sendFiles, dropTarget } = useContactPending();

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
  <div ref="dropTarget">
    <div v-if="pendingQuery.isLoading.value" class="text-center py-12 text-muted-foreground">
      Carregando pendências...
    </div>

    <div v-else-if="!groupedItems.length" class="text-center py-12">
      <div
        class="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary"
      >
        <Bell class="h-6 w-6" />
      </div>
      <h2 class="text-xl font-semibold">Tudo certo por aqui!</h2>
      <p class="text-muted-foreground mt-2">
        Nenhuma empresa possui documentos pendentes para envio neste momento.
      </p>
    </div>

    <div v-else class="space-y-8">
      <div v-for="group in groupedItems" :key="group.requestId" class="space-y-4">
        <h2 class="text-lg font-semibold flex items-center gap-2">
          {{ group.companyName }}
          <span class="text-muted-foreground font-normal text-sm"
            >— Competência {{ monthLabel(group.referenceMonth) }}</span
          >
        </h2>

        <Card v-for="row in group.items" :key="row.item.id">
          <CardContent class="p-6">
            <div class="flex flex-col sm:flex-row gap-6 justify-between items-start">
              <div class="space-y-2 flex-1">
                <div class="flex items-center gap-3">
                  <h3 class="font-semibold">{{ row.item.name }}</h3>
                  <Badge v-if="row.item.status === 'rejected'" variant="destructive"
                    >Recusado</Badge
                  >
                  <Badge v-else-if="isOverdue(row.item.dueDate)" variant="destructive"
                    >Atrasado</Badge
                  >
                  <Badge v-else variant="secondary">Pendente</Badge>
                </div>

                <p v-if="row.item.description" class="text-sm text-muted-foreground">
                  {{ row.item.description }}
                </p>

                <div class="text-sm text-muted-foreground flex gap-4">
                  <span v-if="row.item.dueDate">Prazo: {{ dateBr(row.item.dueDate) }}</span>
                  <span v-if="row.item.acceptedFormats?.length">
                    Formatos: {{ row.item.acceptedFormats.join(', ').toUpperCase() }}
                  </span>
                </div>

                <div
                  v-if="row.item.status === 'rejected' && row.item.rejections?.[0]"
                  class="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm flex gap-2"
                >
                  <CircleAlert class="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p class="font-medium">Motivo da recusa:</p>
                    <p>{{ row.item.rejections[0].reason }}</p>
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
                  class="w-full sm:w-auto"
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
