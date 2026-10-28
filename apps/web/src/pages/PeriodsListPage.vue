<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, CalendarPlus, Check, Clock, Copy, FileArchive, Lock } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PageHeader from '@/components/PageHeader.vue';
import EmptyState from '@/components/ui/empty/EmptyState.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import Modal from '@/components/Modal.vue';
import StatusPill from '@/components/StatusPill.vue';
import Callout from '@/components/Callout.vue';

import {
  usePeriodsFeature,
  usePeriodDetailFeature,
} from '@/features/periods/composables/usePeriodsFeature';
import { getPeriodPreview } from '@/features/periods/api/periods';
import { useQuery } from '@tanstack/vue-query';
import { monthLabel, dateTimeBr, defaultReferenceMonth, MONTH_OPTIONS } from '@/utils/format';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import { useCopy } from '@/composables/useCopy';
import { useAuthStore } from '@/stores/auth';
import PlanGateNotice from '@/components/PlanGateNotice.vue';
import { planGateMessage } from '@competa/contracts';

const auth = useAuthStore();
const canPeriodZip = computed(() => auth.can('periodZip'));
const periodZipHint = planGateMessage('periodZip');

const page = ref(1);
const perPage = ref(20);
const filter = ref<'todas' | 'open' | 'closed'>('todas');

const chips = [
  { value: 'todas' as const, label: 'Todas' },
  { value: 'open' as const, label: 'Abertas' },
  { value: 'closed' as const, label: 'Encerradas' },
];

const { periodsQuery, openPeriodMutation, closePeriodMutation, downloadPeriodZip } =
  usePeriodsFeature(page, perPage.value);

const periodsData = computed(() => periodsQuery.data.value?.data ?? []);

const current = computed(() => {
  return [...periodsData.value]
    .filter((row) => row.status === 'open')
    .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth))[0];
});

const { detailQuery } = usePeriodDetailFeature(computed(() => current.value?.id));

const visible = computed(() => {
  const rows = [...periodsData.value].sort((a, b) =>
    b.referenceMonth.localeCompare(a.referenceMonth),
  );
  return filter.value === 'todas' ? rows : rows.filter((row) => row.status === filter.value);
});

const counts = computed(() => {
  const rows = periodsData.value;
  return {
    todas: rows.length,
    open: rows.filter((row) => row.status === 'open').length,
    closed: rows.filter((row) => row.status === 'closed').length,
  };
});

const modalOpen = ref(false);
const result = ref<any | null>(null);
const openError = ref<string | null>(null);

const opening = ref({
  referenceMonth: defaultReferenceMonth(),
  dueDate: '',
});

const monthPart = computed(() => opening.value.referenceMonth.slice(5, 7));
const yearPart = computed(() => Number(opening.value.referenceMonth.slice(0, 4)));

function setMonth(month: string) {
  opening.value.referenceMonth = `${opening.value.referenceMonth.slice(0, 4)}-${month}`;
}
function setYear(year: string) {
  opening.value.referenceMonth = `${year}-${opening.value.referenceMonth.slice(5, 7)}`;
}

const years = Array.from(
  { length: 4 },
  (_, index) => Number(defaultReferenceMonth().slice(0, 4)) - 2 + index,
);

/* A prévia é o fan-out de verdade rodado sem gravar: contar no navegador só via as 100
 * primeiras Empresas e não sabia de checklist vazio no mês nem de item avulso. */
const previewQuery = useQuery({
  queryKey: computed(() => ['periodPreview', opening.value.referenceMonth]),
  queryFn: () => getPeriodPreview(opening.value.referenceMonth),
  enabled: computed(() => modalOpen.value && /^\d{4}-\d{2}$/.test(opening.value.referenceMonth)),
});

const preview = computed(() => {
  const data = previewQuery.data.value;
  const recipients = (data?.requests ?? []).map((row) => ({
    id: row.companyId,
    name: row.companyName,
  }));
  return {
    created: recipients.length,
    recipients,
    emailCount: recipients.length,
    withoutTemplate: (data?.skipped ?? [])
      .filter((row) => row.blockedBy === 'template')
      .map((row) => ({ id: row.companyId, name: row.companyName })),
  };
});

const step = ref<'form' | 'confirm'>('form');

function review() {
  openError.value = null;
  step.value = 'confirm';
}

function openModal() {
  result.value = null;
  openError.value = null;
  step.value = 'form';
  opening.value = { referenceMonth: defaultReferenceMonth(), dueDate: '' };
  modalOpen.value = true;
}

async function openPeriod() {
  openError.value = null;
  try {
    const created = await openPeriodMutation.mutateAsync({
      referenceMonth: opening.value.referenceMonth,
      dueDate: opening.value.dueDate || undefined,
    });
    result.value = created;
    const sent = created.requests.length;
    toast.success(
      sent === 1
        ? 'Competência aberta. 1 link enviado por e-mail.'
        : `Competência aberta. ${sent} links enviados por e-mail.`,
    );
  } catch (error) {
    openError.value = apiErrorMessage(error, 'Não foi possível abrir a competência.');
  }
}

const { copiedKey, copy } = useCopy();

const copyLink = (request: any) =>
  copy(request.uploadUrl, `Link de ${request.companyName} copiado.`, request.id);

function closeResult() {
  modalOpen.value = false;
  result.value = null;
}

const confirmClose = ref<string | null>(null);

async function handleClosePeriod(id: string) {
  try {
    const closed = await closePeriodMutation.mutateAsync(id);
    toast.success(closed.warning ?? 'Competência encerrada.');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível encerrar a competência.'));
  } finally {
    confirmClose.value = null;
  }
}

async function downloadZip(id: string, refMonth: string) {
  try {
    await downloadPeriodZip(id, refMonth);
    toast.success(`Download da competência ${monthLabel(refMonth)} concluído.`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
  }
}
</script>

<template>
  <PageHeader title="Competências" description="Abertura do mês e disparos de e-mail.">
    <Button @click="openModal" class="shadow-xs font-medium">
      <CalendarPlus class="mr-2 h-4 w-4" /> Abrir competência
    </Button>
  </PageHeader>

  <main class="mt-8">
    <PlanGateNotice v-if="!canPeriodZip" capability="periodZip" class="mb-4">
      Baixar o zip da competência inteira (o zip por empresa continua liberado)
    </PlanGateNotice>

    <template v-if="periodsQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="periodsQuery.refetch()" />
    </template>

    <template v-else-if="periodsQuery.isLoading.value">
      <LoadingRows />
    </template>

    <template v-else-if="periodsQuery.data.value?.data.length === 0">
      <EmptyState
        title="Nenhuma competência aberta"
        description="Abra a primeira competência para solicitar os documentos às suas empresas."
        :icon="CalendarPlus"
        action-label="Abrir competência"
        @action="openModal"
      />
    </template>

    <template v-else>
      <div
        v-if="current"
        class="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:gap-6 shadow-sm"
      >
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2 mb-1.5">
            <span
              class="inline-flex items-center rounded-full bg-primary/10 border border-primary/20 px-2.5 py-0.5 text-xs font-semibold text-primary"
            >
              Competência ativa
            </span>
          </div>
          <h2 class="text-foreground font-display text-xl sm:text-2xl font-bold tracking-tight">
            Competência atual: {{ monthLabel(current.referenceMonth) }}
          </h2>
          <p class="text-muted-foreground mt-1 text-sm flex items-center gap-1.5">
            <template v-if="detailQuery.isLoading.value">Carregando andamento...</template>
            <template v-else-if="detailQuery.data.value">
              <span class="font-display font-semibold text-foreground tabular-nums">
                {{ detailQuery.data.value.completeRequestCount }}
              </span>
              de
              <span class="font-display font-semibold text-foreground tabular-nums">
                {{ detailQuery.data.value.requestCount }}
              </span>
              entregues
            </template>
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2.5">
          <Button variant="outline" as-child class="shadow-xs">
            <RouterLink :to="`/competencias/${current.id}/pendencias`">
              <Clock class="mr-2 h-4 w-4" /> Cobrar pendentes
            </RouterLink>
          </Button>
          <Button as-child class="shadow-xs font-medium">
            <RouterLink :to="`/competencias/${current.id}/pendencias`">
              <ArrowRight class="mr-2 h-4 w-4" /> Ver painel
            </RouterLink>
          </Button>
        </div>
      </div>

      <div class="mb-5 flex gap-2 overflow-x-auto pb-2">
        <button
          v-for="chip in chips"
          :key="chip.value"
          type="button"
          class="shrink-0 rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="
            filter === chip.value
              ? 'border-primary/40 bg-primary/10 text-primary font-semibold shadow-xs'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          @click="filter = chip.value"
        >
          {{ chip.label }}
          <span
            class="ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="
              filter === chip.value
                ? 'bg-primary/20 text-primary'
                : 'bg-muted text-muted-foreground'
            "
          >
            {{ counts[chip.value] }}
          </span>
        </button>
      </div>

      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader class="bg-sunken/60">
              <TableRow class="hover:bg-transparent border-border">
                <TableHead class="font-semibold text-foreground">Mês</TableHead>
                <TableHead class="font-semibold text-foreground">Status</TableHead>
                <TableHead class="font-semibold text-foreground">Abertura</TableHead>
                <TableHead class="font-semibold text-foreground">Solicitações</TableHead>
                <TableHead class="text-right font-semibold text-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="row in visible"
                :key="row.id"
                class="border-border hover:bg-slate-50/75 transition-colors"
              >
                <TableCell class="font-medium font-display text-foreground">
                  <RouterLink
                    :to="`/competencias/${row.id}/pendencias`"
                    class="hover:text-primary transition-colors hover:underline"
                  >
                    {{ monthLabel(row.referenceMonth) }}
                  </RouterLink>
                </TableCell>
                <TableCell>
                  <StatusPill :status="row.status" />
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  {{ dateTimeBr(row.createdAt) }}
                </TableCell>
                <TableCell>
                  <span class="tabular-nums font-semibold text-foreground">{{
                    row.requestCount
                  }}</span>
                  envios
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <!-- o `title` fica no span: botão desabilitado não dispara hover -->
                    <span
                      :title="canPeriodZip ? 'Baixar .zip de todas as empresas' : periodZipHint"
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        class="hover:bg-sunken text-muted-foreground hover:text-foreground"
                        :disabled="!canPeriodZip"
                        :aria-label="
                          canPeriodZip ? 'Baixar .zip de todas as empresas' : periodZipHint
                        "
                        @click="downloadZip(row.id, row.referenceMonth)"
                      >
                        <FileArchive class="h-4 w-4" />
                      </Button>
                    </span>
                    <Button
                      v-if="row.status === 'open'"
                      variant="ghost"
                      size="icon"
                      class="text-danger hover:text-danger hover:bg-danger-surface"
                      @click="confirmClose = row.id"
                      title="Encerrar"
                    >
                      <Lock class="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </template>
  </main>

  <Modal
    v-model:open="modalOpen"
    title="Abrir nova competência"
    description="Isto cria um checklist para cada empresa com base no template delas e dispara os emails de solicitação."
  >
    <Callout v-if="openError" tone="danger" :heading="openError" class="mb-4 mt-2" />

    <template v-if="result">
      <Callout tone="success" heading="Competência aberta com sucesso" class="mt-4">
        <p>Os emails foram enviados e os contatos já podem acessar os links.</p>
      </Callout>

      <ul
        class="border-border max-h-64 divide-y divide-border overflow-y-auto rounded-xl border mt-4 bg-card"
        role="list"
      >
        <li
          v-for="req in result.requests"
          :key="req.id"
          class="p-3.5 hover:bg-slate-50/75 transition-colors"
        >
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-sm font-semibold text-foreground">{{ req.companyName }}</p>
              <p class="text-muted-foreground text-xs mt-0.5">
                {{ req.itemCount }} documentos exigidos
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              class="hover:bg-sunken text-foreground"
              @click="copyLink(req)"
            >
              <Check v-if="copiedKey === req.id" class="mr-2 h-4 w-4 text-success" />
              <Copy v-else class="mr-2 h-4 w-4" />
              {{ copiedKey === req.id ? 'Copiado!' : 'Link' }}
            </Button>
          </div>
        </li>
      </ul>

      <div class="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex justify-end border-t p-4">
        <Button @click="closeResult" class="font-medium">Entendi</Button>
      </div>
    </template>

    <template v-else>
      <form
        v-if="step === 'form'"
        id="open-period-form"
        class="mt-4 flex flex-col gap-6"
        @submit.prevent="review"
      >
        <fieldset class="flex flex-col gap-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <Label class="text-sm font-medium text-foreground"
              >Mês de referência (Competência)</Label
            >
            <!-- Year selector pills -->
            <div
              class="flex items-center gap-1 bg-sunken p-0.5 rounded-lg border border-border-subtle"
            >
              <button
                v-for="year in years"
                :key="year"
                type="button"
                class="px-2.5 py-1 text-xs font-medium rounded-md transition-colors"
                :class="
                  year === yearPart
                    ? 'bg-card text-foreground font-semibold shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                "
                @click="setYear(String(year))"
              >
                {{ year }}
              </button>
            </div>
          </div>

          <!-- 12-month selector grid with active month in amber brand -->
          <div class="grid grid-cols-3 sm:grid-cols-4 gap-1.5 pt-1">
            <button
              v-for="month in MONTH_OPTIONS"
              :key="month.value"
              type="button"
              class="h-9.5 rounded-lg px-2 text-xs font-medium border transition-colors flex items-center justify-center text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              :class="
                month.value === monthPart
                  ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-xs'
                  : 'border-border bg-surface text-foreground hover:bg-sunken hover:border-border-strong'
              "
              @click="setMonth(month.value)"
            >
              {{ month.label }}
            </button>
          </div>

          <!-- Hidden fallback selects for exact aria-label and aria-describedby accessibility -->
          <div class="sr-only">
            <select
              aria-label="Mês"
              aria-describedby="month-help"
              :value="monthPart"
              tabindex="-1"
              @change="setMonth(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="month in MONTH_OPTIONS" :key="month.value" :value="month.value">
                {{ month.label }}
              </option>
            </select>
            <select
              aria-label="Ano"
              aria-describedby="month-help"
              :value="yearPart"
              tabindex="-1"
              @change="setYear(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="year in years" :key="year" :value="year">
                {{ year }}
              </option>
            </select>
          </div>

          <p id="month-help" class="text-muted-foreground text-xs mt-1">
            O mês a que os documentos se referem — normalmente o mês passado.
          </p>
        </fieldset>

        <div class="flex flex-col gap-1.5">
          <Label for="general-due-date" class="text-sm font-medium text-foreground"
            >Prazo geral da competência (opcional)</Label
          >
          <Input
            id="general-due-date"
            type="date"
            v-model="opening.dueDate"
            aria-describedby="due-date-help"
            class="bg-surface shadow-xs focus-visible:ring-ring focus-visible:border-primary"
          />
          <p id="due-date-help" class="text-muted-foreground text-xs">
            Usado quando o item não tem prazo próprio.
          </p>
        </div>

        <div class="bg-sunken/60 border-border rounded-xl border p-3.5 text-sm text-foreground">
          <p>
            Serão criadas
            <strong class="tabular-nums font-semibold">{{ preview.created }}</strong> solicitações
            para as empresas ativas com template e Responsável cadastrado.
          </p>
        </div>

        <div
          v-if="preview.withoutTemplate.length"
          class="rounded-xl border border-warning-border bg-warning-surface p-4 text-sm text-warning-foreground"
          role="note"
        >
          <p class="font-semibold">
            {{ preview.withoutTemplate.length }} empresa(s) não receberão comunicado — sem template
            de checklist:
          </p>
          <ul class="mt-2.5 flex flex-col gap-1.5">
            <li
              v-for="company in preview.withoutTemplate"
              :key="company.id"
              class="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm"
            >
              <span>{{ company.name }}</span>
              <RouterLink
                :to="`/empresas/${company.id}/editar`"
                class="font-semibold underline hover:text-warning-foreground/80"
                @click="modalOpen = false"
              >
                Cadastrar template
              </RouterLink>
            </li>
          </ul>
        </div>
      </form>

      <div v-if="step === 'confirm'" class="mt-5 flex flex-col gap-4">
        <div class="border-border bg-sunken/50 rounded-xl border p-4 text-sm text-foreground">
          <p class="font-medium">
            Vamos enviar
            <strong class="tabular-nums font-bold">{{ preview.emailCount }}</strong> e-mails agora,
            de {{ monthLabel(opening.referenceMonth) }}, para o contato principal de
            <strong class="tabular-nums font-bold">{{ preview.created }}</strong> empresas.
          </p>
          <p class="text-muted-foreground mt-1 text-xs">
            Cada Responsável principal recebe o link de envio dele. Isso não se desfaz.
          </p>
        </div>
        <ul
          class="border-border max-h-64 divide-y divide-border overflow-y-auto rounded-xl border bg-card"
          role="list"
        >
          <li
            v-for="company in preview.recipients"
            :key="company.id"
            class="p-3.5 hover:bg-slate-50/75 transition-colors"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-semibold text-foreground">{{ company.name }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div
        class="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex flex-wrap justify-end gap-2.5 border-t p-4"
      >
        <template v-if="step === 'confirm'">
          <Button variant="ghost" type="button" @click="step = 'form'">Voltar</Button>
          <Button
            type="button"
            :disabled="openPeriodMutation.isPending.value"
            class="font-medium"
            @click="openPeriod"
          >
            {{
              openPeriodMutation.isPending.value
                ? 'Enviando…'
                : 'Confirmar e enviar ' + preview.emailCount + ' e-mails'
            }}
          </Button>
        </template>
        <template v-else>
          <Button variant="ghost" type="button" @click="modalOpen = false">Cancelar</Button>
          <Button
            type="submit"
            form="open-period-form"
            :disabled="preview.created === 0"
            class="font-medium"
            >Revisar envios</Button
          >
        </template>
      </div>
    </template>
  </Modal>

  <Modal
    :open="confirmClose !== null"
    @update:open="$event ? null : (confirmClose = null)"
    title="Encerrar competência?"
    description="Encerrar é a palavra final: as solicitações desta competência também são encerradas, mesmo com pendências."
  >
    <p class="text-sm text-foreground">
      Os Responsáveis não poderão mais enviar documentos nos itens — apenas documentos extras.
    </p>
    <div
      class="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex flex-wrap justify-end gap-2.5 border-t p-4"
    >
      <Button variant="ghost" @click="confirmClose = null">Cancelar</Button>
      <Button
        variant="destructive"
        :disabled="closePeriodMutation.isPending.value"
        @click="handleClosePeriod(confirmClose!)"
      >
        {{ closePeriodMutation.isPending.value ? 'Encerrando…' : 'Encerrar competência' }}
      </Button>
    </div>
  </Modal>
</template>
