<script setup lang="ts">
import { computed, ref } from 'vue';
import { ArrowRight, CalendarPlus, Clock, Copy, FileArchive, Lock } from 'lucide-vue-next';
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
import { useCompaniesFeature } from '@/features/companies/composables/useCompaniesFeature';
import { monthLabel, dateTimeBr, defaultReferenceMonth, MONTH_OPTIONS } from '@/utils/format';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';

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

const activePage = ref(1);
const activePerPage = ref(100);
const { companiesQuery: activeCompaniesQuery } = useCompaniesFeature(
  activePage,
  activePerPage,
  ref('true'),
);

const preview = computed(() => {
  const rows = activeCompaniesQuery.data.value?.data ?? [];
  const withoutTemplate = rows.filter((row: any) => !row.checklistTemplateId);
  const recipients = rows.filter((row: any) => row.contactCount > 0 && row.checklistTemplateId);
  return {
    created: recipients.length,
    recipients,
    emailCount: recipients.length,
    withoutContact: rows.filter((row: any) => row.contactCount === 0 && row.checklistTemplateId),
    withoutTemplate,
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

async function copyLink(request: any) {
  try {
    await navigator.clipboard.writeText(request.uploadUrl);
    toast.success(`Link de ${request.companyName} copiado.`);
  } catch {
    toast.error('Não foi possível copiar o link.');
  }
}

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
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
  }
}
</script>

<template>
  <PageHeader title="Competências" description="Abertura do mês e disparos de e-mail.">
    <Button @click="openModal"> <CalendarPlus class="mr-2 h-4 w-4" /> Abrir competência </Button>
  </PageHeader>

  <main class="mt-8">
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
        icon="CalendarPlus"
        actionLabel="Abrir competência"
        @action="openModal"
      />
    </template>

    <template v-else>
      <div
        v-if="current"
        class="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6 shadow-sm"
      >
        <div class="min-w-0">
          <h2 class="text-foreground text-sm font-semibold tracking-tight sm:text-base">
            Competência atual: {{ monthLabel(current.referenceMonth) }}
          </h2>
          <p class="text-muted-foreground mt-1 text-sm">
            <template v-if="detailQuery.isLoading.value">Carregando andamento...</template>
            <template v-else-if="detailQuery.data.value">
              {{ detailQuery.data.value.completeRequestCount }} de
              {{ detailQuery.data.value.requestCount }} entregues
            </template>
          </p>
        </div>
        <div class="flex shrink-0 flex-wrap items-center gap-2">
          <Button variant="outline" as-child>
            <RouterLink :to="`/competencias/${current.id}/pendencias`">
              <Clock class="mr-2 h-4 w-4" /> Cobrar pendentes
            </RouterLink>
          </Button>
          <Button as-child>
            <RouterLink :to="`/competencias/${current.id}`">
              <ArrowRight class="mr-2 h-4 w-4" /> Ver painel
            </RouterLink>
          </Button>
        </div>
      </div>

      <div class="mb-4 flex gap-2 overflow-x-auto pb-2">
        <button
          v-for="chip in chips"
          :key="chip.value"
          type="button"
          class="border-border bg-card hover:bg-muted focus-visible:ring-ring shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2"
          :class="{ 'border-primary bg-primary/5 text-primary': filter === chip.value }"
          @click="filter = chip.value"
        >
          {{ chip.label }}
          <span
            class="bg-muted text-muted-foreground ml-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            :class="{ 'bg-primary/20 text-primary': filter === chip.value }"
          >
            {{ counts[chip.value] }}
          </span>
        </button>
      </div>

      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Mês</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Abertura</TableHead>
                <TableHead>Solicitações</TableHead>
                <TableHead class="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in visible" :key="row.id">
                <TableCell class="font-medium">
                  <RouterLink :to="`/competencias/${row.id}`" class="hover:underline">
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
                  <span class="tabular-nums">{{ row.requestCount }}</span> envios
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      @click="downloadZip(row.id, row.referenceMonth)"
                      title="Baixar .zip de todas as empresas"
                    >
                      <FileArchive class="h-4 w-4" />
                    </Button>
                    <Button
                      v-if="row.status === 'open'"
                      variant="ghost"
                      size="icon"
                      class="text-danger hover:text-danger hover:bg-danger/10"
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
        class="border-border max-h-64 divide-y overflow-y-auto rounded-lg border mt-4"
        role="list"
      >
        <li v-for="req in result.requests" :key="req.id" class="p-3">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium">{{ req.companyName }}</p>
              <p class="text-muted-foreground text-xs">{{ req.itemCount }} documentos exigidos</p>
            </div>
            <Button variant="ghost" size="sm" @click="copyLink(req)">
              <Copy class="mr-2 h-4 w-4" /> Link
            </Button>
          </div>
        </li>
      </ul>

      <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex justify-end border-t p-4">
        <Button @click="closeResult">Entendi</Button>
      </div>
    </template>

    <template v-else>
      <form
        v-if="step === 'form'"
        id="open-period-form"
        class="mt-4 flex flex-col gap-6"
        @submit.prevent="review"
      >
        <fieldset class="flex flex-col gap-1.5">
          <Label>Mês de referência (Competência)</Label>
          <div class="flex gap-2">
            <select
              class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Mês"
              aria-describedby="month-help"
              @change="setMonth(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="month in MONTH_OPTIONS"
                :key="month.value"
                :value="month.value"
                :selected="month.value === monthPart"
              >
                {{ month.label }}
              </option>
            </select>
            <select
              class="flex h-9 w-28 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              aria-label="Ano"
              aria-describedby="month-help"
              @change="setYear(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="year in years" :key="year" :value="year" :selected="year === yearPart">
                {{ year }}
              </option>
            </select>
          </div>
          <p id="month-help" class="text-muted-foreground text-xs">
            O mês a que os documentos se referem — normalmente o mês passado.
          </p>
        </fieldset>

        <div class="flex flex-col gap-1.5">
          <Label for="general-due-date">Prazo geral da competência (opcional)</Label>
          <Input
            id="general-due-date"
            type="date"
            v-model="opening.dueDate"
            aria-describedby="due-date-help"
          />
          <p id="due-date-help" class="text-muted-foreground text-xs">
            Usado quando o item não tem prazo próprio.
          </p>
        </div>

        <div class="bg-muted/50 border-border rounded-lg border p-3 text-sm">
          <p>
            Serão criadas <strong class="tabular-nums">{{ preview.created }}</strong> solicitações
            para as empresas ativas com template e Responsável cadastrado.
          </p>
        </div>

        <div
          v-if="preview.withoutTemplate.length"
          class="rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
          role="note"
        >
          <p class="font-medium">
            {{ preview.withoutTemplate.length }} empresa(s) não receberão comunicado — sem template
            de checklist:
          </p>
          <ul class="mt-2 flex flex-col gap-1">
            <li
              v-for="company in preview.withoutTemplate"
              :key="company.id"
              class="flex flex-wrap items-center justify-between gap-2"
            >
              <span>{{ company.name }}</span>
              <RouterLink
                :to="`/empresas/${company.id}/editar`"
                class="font-medium underline"
                @click="modalOpen = false"
              >
                Cadastrar template
              </RouterLink>
            </li>
          </ul>
        </div>
      </form>

      <div v-if="step === 'confirm'" class="mt-5 flex flex-col gap-3">
        <div class="border-border rounded-lg border p-3 text-sm">
          <p class="font-medium">
            Vamos enviar <strong class="tabular-nums">{{ preview.emailCount }}</strong> e-mails
            agora, de {{ monthLabel(opening.referenceMonth) }}, para o contato principal de
            <strong class="tabular-nums">{{ preview.created }}</strong> empresas.
          </p>
          <p class="text-muted-foreground mt-1 text-xs">
            Cada Responsável principal recebe o link de envio dele. Isso não se desfaz.
          </p>
        </div>
        <ul class="border-border max-h-64 divide-y overflow-y-auto rounded-lg border" role="list">
          <li v-for="company in preview.recipients" :key="company.id" class="p-3">
            <div class="flex items-center justify-between gap-2">
              <p class="text-sm font-medium">{{ company.name }}</p>
            </div>
          </li>
        </ul>
      </div>

      <div
        class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
      >
        <template v-if="step === 'confirm'">
          <Button variant="ghost" type="button" @click="step = 'form'">Voltar</Button>
          <Button type="button" :disabled="openPeriodMutation.isPending.value" @click="openPeriod">
            {{
              openPeriodMutation.isPending.value
                ? 'Enviando…'
                : 'Confirmar e enviar ' + preview.emailCount + ' e-mails'
            }}
          </Button>
        </template>
        <template v-else>
          <Button variant="ghost" type="button" @click="modalOpen = false">Cancelar</Button>
          <Button type="submit" form="open-period-form" :disabled="preview.created === 0"
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
    <p class="text-sm">
      Os Responsáveis não poderão mais enviar documentos nos itens — apenas documentos extras.
    </p>
    <div
      class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
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
