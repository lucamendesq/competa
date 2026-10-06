<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useQuery } from '@tanstack/vue-query';
import { Check, ExternalLink, X } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import PageHeader from '@/components/PageHeader.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import StatusPill from '@/components/StatusPill.vue';
import DueDate from '@/components/DueDate.vue';
import {
  getRequestDetail,
  openDocumentContent,
  publishReview,
  type RequestDocument,
  type RequestItem,
} from '@/features/requests/api/requests';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import { dateTimeBr, fileSize, monthLabel } from '@/utils/format';

const props = defineProps<{ id: string }>();
const router = useRouter();

const detailQuery = useQuery({
  queryKey: computed(() => ['requestDetail', props.id]),
  queryFn: () => getRequestDetail(props.id),
  enabled: computed(() => !!props.id),
});

const acceptedItemIds = ref<Set<string>>(new Set());
const rejections = ref<Map<string, string>>(new Map());
const extras = ref<Map<string, { decision: 'accepted' | 'rejected'; rejectionReason: string }>>(
  new Map(),
);
const acting = ref(false);

const closed = computed(() => detailQuery.data.value?.status === 'closed');

const reviewableItems = computed(() =>
  (detailQuery.data.value?.items ?? []).filter((item) => item.status === 'submitted'),
);

const settledItems = computed(() =>
  (detailQuery.data.value?.items ?? []).filter((item) => item.status !== 'submitted'),
);

const pendingDocuments = (item: RequestItem) =>
  item.documents.filter((doc) => doc.reviewStatus === 'pending');

const itemBlocked = (item: RequestItem) =>
  pendingDocuments(item).some((doc) => rejections.value.has(doc.id));

const decisionCount = computed(
  () => acceptedItemIds.value.size + rejections.value.size + extras.value.size,
);

function toggleAcceptItem(item: RequestItem) {
  const next = new Set(acceptedItemIds.value);
  if (next.has(item.id)) next.delete(item.id);
  else next.add(item.id);
  acceptedItemIds.value = next;
}

function toggleRejectDocument(item: RequestItem, doc: RequestDocument) {
  const next = new Map(rejections.value);
  if (next.has(doc.id)) next.delete(doc.id);
  else next.set(doc.id, '');
  rejections.value = next;

  if (next.has(doc.id)) {
    const accepted = new Set(acceptedItemIds.value);
    accepted.delete(item.id);
    acceptedItemIds.value = accepted;
  }
}

function setRejectionReason(documentId: string, reason: string) {
  const next = new Map(rejections.value);
  next.set(documentId, reason);
  rejections.value = next;
}

function toggleExtra(doc: RequestDocument, decision: 'accepted' | 'rejected') {
  const next = new Map(extras.value);
  if (next.get(doc.id)?.decision === decision) next.delete(doc.id);
  else next.set(doc.id, { decision, rejectionReason: next.get(doc.id)?.rejectionReason ?? '' });
  extras.value = next;
}

function setExtraReason(documentId: string, reason: string) {
  const current = extras.value.get(documentId);
  if (!current) return;
  const next = new Map(extras.value);
  next.set(documentId, { ...current, rejectionReason: reason });
  extras.value = next;
}

const missingReason = computed(() => {
  for (const reason of rejections.value.values()) {
    if (reason.trim().length < 3) return true;
  }
  for (const extra of extras.value.values()) {
    if (extra.decision === 'rejected' && extra.rejectionReason.trim().length < 3) return true;
  }
  return false;
});

async function openDocument(doc: RequestDocument) {
  try {
    const { objectUrl } = await openDocumentContent(doc.id);
    window.open(objectUrl, '_blank', 'noopener');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível abrir o documento.'));
  }
}

function discard() {
  acceptedItemIds.value = new Set();
  rejections.value = new Map();
  extras.value = new Map();
}

async function publish() {
  if (decisionCount.value === 0 || missingReason.value) return;
  acting.value = true;
  try {
    const result = await publishReview(props.id, {
      acceptItemIds: [...acceptedItemIds.value],
      rejectDocuments: [...rejections.value.entries()].map(([documentId, rejectionReason]) => ({
        documentId,
        rejectionReason: rejectionReason.trim(),
      })),
      reviewExtras: [...extras.value.entries()].map(([documentId, extra]) => ({
        documentId,
        decision: extra.decision,
        rejectionReason: extra.decision === 'rejected' ? extra.rejectionReason.trim() : undefined,
      })),
    });
    discard();
    toast.success(
      result.completed
        ? 'Revisão publicada. Solicitação completa.'
        : `Revisão publicada: ${result.acceptedItems} aceite(s), ${result.rejectedDocuments} recusa(s).`,
    );
    detailQuery.refetch();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível publicar a revisão.'));
  } finally {
    acting.value = false;
  }
}
</script>

<template>
  <PageHeader
    :title="
      'Conferir documentos' +
      (detailQuery.data.value ? ' — ' + detailQuery.data.value.companyName : '')
    "
    :description="
      detailQuery.data.value
        ? 'Competência ' + monthLabel(detailQuery.data.value.referenceMonth)
        : 'Aceite ou recuse os documentos enviados.'
    "
  >
    <Button variant="outline" @click="router.back()">Voltar</Button>
  </PageHeader>

  <main class="mt-8 pb-24">
    <template v-if="detailQuery.isLoading.value">
      <LoadingRows :count="6" />
    </template>
    <template v-else-if="detailQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="detailQuery.refetch()" />
    </template>
    <template v-else>
      <div
        v-if="closed"
        class="border-border bg-muted/30 mb-6 rounded-xl border p-4 text-sm text-muted-foreground"
      >
        Solicitação encerrada: não é mais possível revisar documentos.
      </div>

      <section v-if="reviewableItems.length" class="flex flex-col gap-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Aguardando conferência ({{ reviewableItems.length }})
        </h2>
        <article
          v-for="item in reviewableItems"
          :key="item.id"
          class="bg-card border-border rounded-xl border p-4 shadow-sm"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <h3 class="text-base font-semibold">{{ item.name }}</h3>
              <DueDate :date="item.dueDate" class="text-xs" />
            </div>
            <Button
              :variant="acceptedItemIds.has(item.id) ? 'default' : 'outline'"
              size="sm"
              :disabled="closed || itemBlocked(item)"
              @click="toggleAcceptItem(item)"
            >
              <Check class="mr-2 h-4 w-4" />
              {{ acceptedItemIds.has(item.id) ? 'Aceite marcado' : 'Aceitar item' }}
            </Button>
          </div>

          <ul class="border-border divide-border mt-4 divide-y rounded-lg border">
            <li v-for="doc in item.documents" :key="doc.id" class="flex flex-col gap-2 p-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">{{ doc.fileName }}</p>
                  <p class="text-muted-foreground text-xs">
                    {{ fileSize(doc.sizeBytes) }} · {{ dateTimeBr(doc.uploadedAt) }}
                  </p>
                </div>
                <div class="flex items-center gap-2">
                  <StatusPill v-if="doc.reviewStatus !== 'pending'" :status="doc.reviewStatus" />
                  <Button variant="ghost" size="sm" @click="openDocument(doc)">
                    <ExternalLink class="mr-2 h-4 w-4" /> Abrir
                  </Button>
                  <Button
                    v-if="doc.reviewStatus === 'pending'"
                    :variant="rejections.has(doc.id) ? 'destructive' : 'outline'"
                    size="sm"
                    :disabled="closed"
                    @click="toggleRejectDocument(item, doc)"
                  >
                    <X class="mr-2 h-4 w-4" />
                    {{ rejections.has(doc.id) ? 'Recusa marcada' : 'Recusar' }}
                  </Button>
                </div>
              </div>
              <Textarea
                v-if="rejections.has(doc.id)"
                :model-value="rejections.get(doc.id)"
                placeholder="Motivo da recusa (o Responsável recebe este texto)"
                rows="2"
                @update:model-value="setRejectionReason(doc.id, String($event))"
              />
            </li>
          </ul>
        </article>
      </section>

      <section v-else class="border-border rounded-xl border-2 border-dashed p-12 text-center">
        <p class="text-muted-foreground text-sm">Nenhum documento aguardando conferência.</p>
      </section>

      <section
        v-if="detailQuery.data.value?.extraDocuments.length"
        class="mt-8 flex flex-col gap-4"
      >
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Documentos extras ({{ detailQuery.data.value.extraDocuments.length }})
        </h2>
        <ul class="bg-card border-border divide-border divide-y rounded-xl border shadow-sm">
          <li
            v-for="doc in detailQuery.data.value.extraDocuments"
            :key="doc.id"
            class="flex flex-col gap-2 p-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">{{ doc.fileName }}</p>
                <p class="text-muted-foreground text-xs">
                  {{ fileSize(doc.sizeBytes) }} · {{ dateTimeBr(doc.uploadedAt) }}
                </p>
              </div>
              <div class="flex items-center gap-2">
                <StatusPill v-if="doc.reviewStatus !== 'pending'" :status="doc.reviewStatus" />
                <Button variant="ghost" size="sm" @click="openDocument(doc)">
                  <ExternalLink class="mr-2 h-4 w-4" /> Abrir
                </Button>
                <template v-if="doc.reviewStatus === 'pending'">
                  <Button
                    :variant="extras.get(doc.id)?.decision === 'accepted' ? 'default' : 'outline'"
                    size="sm"
                    @click="toggleExtra(doc, 'accepted')"
                  >
                    <Check class="mr-2 h-4 w-4" /> Aceitar
                  </Button>
                  <Button
                    :variant="
                      extras.get(doc.id)?.decision === 'rejected' ? 'destructive' : 'outline'
                    "
                    size="sm"
                    @click="toggleExtra(doc, 'rejected')"
                  >
                    <X class="mr-2 h-4 w-4" /> Recusar
                  </Button>
                </template>
              </div>
            </div>
            <Textarea
              v-if="extras.get(doc.id)?.decision === 'rejected'"
              :model-value="extras.get(doc.id)?.rejectionReason"
              placeholder="Motivo da recusa"
              rows="2"
              @update:model-value="setExtraReason(doc.id, String($event))"
            />
          </li>
        </ul>
      </section>

      <section v-if="settledItems.length" class="mt-8 flex flex-col gap-2">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Demais itens ({{ settledItems.length }})
        </h2>
        <ul class="bg-card border-border divide-border divide-y rounded-xl border shadow-sm">
          <li
            v-for="item in settledItems"
            :key="item.id"
            class="flex flex-wrap items-center justify-between gap-2 p-3"
          >
            <span class="text-sm font-medium">{{ item.name }}</span>
            <StatusPill :status="item.status" />
          </li>
        </ul>
      </section>
    </template>
  </main>

  <div
    v-if="decisionCount > 0"
    class="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)]"
  >
    <div class="mx-auto flex max-w-5xl items-center justify-between gap-3">
      <span class="text-sm font-medium">
        {{ decisionCount }} decisão(ões) não publicada(s)
        <span v-if="missingReason" class="text-danger">— informe o motivo das recusas</span>
      </span>
      <div class="flex items-center gap-2">
        <Button variant="ghost" :disabled="acting" @click="discard">Descartar</Button>
        <Button :disabled="acting || missingReason" @click="publish">
          {{ acting ? 'Publicando...' : 'Publicar revisão' }}
        </Button>
      </div>
    </div>
  </div>
</template>
