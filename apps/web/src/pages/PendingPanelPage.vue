<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  BellRing,
  ChevronDown,
  CircleCheck,
  FileArchive,
  Lock,
  Mail,
  MailWarning,
  PartyPopper,
  Search,
  TriangleAlert,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import PageHeader from '@/components/PageHeader.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import Modal from '@/components/Modal.vue';
import StatusPill from '@/components/StatusPill.vue';
import DueDate from '@/components/DueDate.vue';
import {
  usePeriodDetailFeature,
  usePeriodsFeature,
} from '@/features/periods/composables/usePeriodsFeature';
import { useCompaniesFeature } from '@/features/companies/composables/useCompaniesFeature';
import { getPendingPanel } from '@/features/periods/api/periods';
import { resendUploadLink, downloadRequestZip } from '@/features/requests/api/requests';
import { useQuery } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import { monthLabel, isOverdue } from '@/utils/format';

const props = defineProps<{ id: string }>();

const { detailQuery } = usePeriodDetailFeature(computed(() => props.id));
const { downloadPeriodZip, closePeriodMutation, runRemindersMutation } = usePeriodsFeature(
  ref(1),
  20,
);

const panelQuery = useQuery({
  queryKey: computed(() => ['pendingPanel', props.id]),
  queryFn: () => getPendingPanel(props.id),
  enabled: computed(() => !!props.id),
});

const { companiesQuery } = useCompaniesFeature(ref(1), ref(100));

const cnpjByCompany = computed(() => {
  const map = new Map<string, string>();
  const companies = companiesQuery.data.value?.data ?? [];
  for (const row of companies) {
    if (row.cnpj) map.set(row.id, row.cnpj);
  }
  return map;
});

const search = ref('');
const filter = ref<'all' | 'pending' | 'overdue' | 'complete' | 'closed'>('all');
const selectedAccountant = ref('all');
const expanded = ref<Set<string>>(new Set());

const lines = computed(() => {
  const data = panelQuery.data.value ?? [];
  return data.map((line) => {
    const total = Object.values(line.counts).reduce((sum, val) => sum + val, 0);
    const overdueCount = line.missing.filter((item) => isOverdue(item.dueDate)).length;
    return {
      ...line,
      cnpj: cnpjByCompany.value.get(line.companyId) ?? null,
      total,
      percent: total ? Math.round((line.counts.accepted / total) * 100) : 0,
      overdue: overdueCount,
    };
  });
});

const counts = computed(() => {
  const list = lines.value;
  return {
    all: list.length,
    pending: list.filter((l) => l.requestStatus === 'open' && l.missing.length).length,
    overdue: list.filter((l) => l.overdue > 0).length,
    complete: list.filter((l) => l.missing.length === 0).length,
    closed: list.filter((l) => l.requestStatus === 'closed').length,
  };
});

const accountantChips = computed(() => {
  const list = lines.value;
  const map = new Map<string, string>();
  let hasUnassigned = false;
  for (const line of list) {
    if (line.responsibleAccountantId && line.responsibleAccountantName) {
      map.set(line.responsibleAccountantId, line.responsibleAccountantName);
    } else {
      hasUnassigned = true;
    }
  }
  if (map.size === 0) return [];
  const chips = [{ value: 'all', label: 'Todos os contadores' }];
  for (const [id, name] of map.entries()) {
    chips.push({ value: id, label: name });
  }
  if (hasUnassigned) {
    chips.push({ value: 'unassigned', label: 'Sem responsável' });
  }
  return chips;
});

const visible = computed(() => {
  const term = search.value.trim().toLowerCase();
  const f = filter.value;
  const acc = selectedAccountant.value;

  return lines.value.filter((line) => {
    if (term && !line.companyName.toLowerCase().includes(term)) return false;
    if (f === 'pending' && !(line.requestStatus === 'open' && line.missing.length > 0))
      return false;
    if (f === 'overdue' && !(line.overdue > 0)) return false;
    if (f === 'complete' && !(line.missing.length === 0)) return false;
    if (f === 'closed' && !(line.requestStatus === 'closed')) return false;

    if (acc !== 'all') {
      if (acc === 'unassigned') {
        if (line.responsibleAccountantId !== null) return false;
      } else if (line.responsibleAccountantId !== acc) {
        return false;
      }
    }
    return true;
  });
});

const sendProgress = computed(() => {
  const list = lines.value;
  const total = list.reduce((sum, line) => sum + line.total, 0);
  const accepted = list.reduce((sum, line) => sum + line.counts.accepted, 0);
  return { total, accepted, percent: total ? Math.round((accepted / total) * 100) : 0 };
});

const allDelivered = computed(
  () => lines.value.length > 0 && lines.value.every((l) => l.missing.length === 0),
);

const chips = [
  { value: 'all', label: 'Todas' },
  { value: 'pending', label: 'Com pendência' },
  { value: 'overdue', label: 'Atrasadas' },
  { value: 'complete', label: 'Completas' },
  { value: 'closed', label: 'Encerradas' },
] as const;

const confirmClose = ref(false);

function toggle(companyId: string) {
  const newSet = new Set(expanded.value);
  if (newSet.has(companyId)) newSet.delete(companyId);
  else newSet.add(companyId);
  expanded.value = newSet;
}

function isExpanded(companyId: string) {
  return expanded.value.has(companyId);
}

function slug(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

async function doDownloadPeriodZip() {
  const reference = detailQuery.data.value?.referenceMonth ?? '';
  try {
    await downloadPeriodZip(props.id, reference);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
  }
}

async function doDownloadCompanyZip(requestId: string, companyName: string) {
  try {
    await downloadRequestZip(requestId, `${slug(companyName)}.zip`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
  }
}

const resendingRequestId = ref<string | null>(null);

async function handleResendUploadLink(line: any) {
  resendingRequestId.value = line.requestId;
  try {
    const link = await resendUploadLink(line.requestId);
    toast.success(`Link de ${line.companyName} enviado para ${link.contactEmail}.`);
    panelQuery.refetch();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível reenviar o link.'));
  } finally {
    resendingRequestId.value = null;
  }
}

async function resendReminders() {
  try {
    await runRemindersMutation.mutateAsync();
    toast.success('Varredura de lembretes disparada.');
    panelQuery.refetch();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível disparar os lembretes.'));
  }
}

async function handleClosePeriod() {
  try {
    const res = await closePeriodMutation.mutateAsync(props.id);
    toast.success(res.warning ?? 'Competência encerrada.');
    detailQuery.refetch();
    panelQuery.refetch();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível encerrar a competência.'));
  } finally {
    confirmClose.value = false;
  }
}

function uniqueFailures(line: any) {
  const labels: Record<string, string> = {
    email: 'e-mail',
    whatsapp: 'WhatsApp',
    push: 'push',
  };
  return [...new Set(line.channelFailures.map((f: any) => labels[f.channel] ?? f.channel))];
}

function maskedCnpj(cnpj: string | null) {
  if (!cnpj) return '—';
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
</script>

<template>
  <PageHeader
    :title="
      'Cobrança da competência ' +
      (detailQuery.data.value?.referenceMonth
        ? monthLabel(detailQuery.data.value.referenceMonth)
        : '')
    "
    description="Acompanhe o painel de pendências desta competência."
  >
    <Button variant="outline" class="mr-2" @click="doDownloadPeriodZip">
      <FileArchive class="mr-2 h-4 w-4" /> Baixar Tudo (.zip)
    </Button>
    <template v-if="detailQuery.data.value?.status === 'open'">
      <Button
        variant="outline"
        class="text-danger hover:text-danger hover:bg-danger/10"
        @click="confirmClose = true"
      >
        <Lock class="mr-2 h-4 w-4" /> Encerrar
      </Button>
    </template>
  </PageHeader>

  <main class="mt-8">
    <template v-if="panelQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="panelQuery.refetch()" />
    </template>
    <template v-else-if="panelQuery.isLoading.value">
      <LoadingRows :count="10" />
    </template>
    <template v-else>
      <div
        v-if="detailQuery.data.value?.status === 'closed'"
        class="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm"
      >
        <div>
          <h2 class="text-base font-semibold">Competência encerrada</h2>
          <p class="text-muted-foreground mt-1 text-sm">
            Os itens pendentes e rejeitados não podem mais receber arquivos.
          </p>
        </div>
        <StatusPill status="closed" />
      </div>
      <div
        v-else-if="allDelivered"
        class="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-success-border bg-success-surface p-4 sm:p-6 shadow-sm"
      >
        <PartyPopper class="text-success mt-1 shrink-0 text-2xl sm:text-3xl" aria-hidden="true" />
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold text-success-foreground">Zero pendências! 🎉</h2>
          <p class="mt-1 text-sm text-success-foreground">
            Todos os {{ sendProgress.total }} documentos exigidos pelas solicitações ativas foram
            enviados e conferidos.
          </p>
        </div>
      </div>
      <div
        v-else
        class="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-4 sm:p-6 shadow-sm"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-semibold">Progresso geral da competência</h2>
            <p class="text-muted-foreground mt-1 text-sm">
              {{ sendProgress.accepted }} de {{ sendProgress.total }} documentos entregues e
              conferidos
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            :disabled="runRemindersMutation.isPending.value"
            @click="resendReminders"
          >
            <BellRing class="mr-2 h-4 w-4" />
            {{ runRemindersMutation.isPending.value ? 'Disparando...' : 'Cobrar atrasados' }}
          </Button>
        </div>
        <div class="bg-muted mt-2 h-3 w-full overflow-hidden rounded-full">
          <div
            class="bg-primary h-full transition-all duration-500 ease-out"
            :style="{ width: sendProgress.percent + '%' }"
          ></div>
        </div>
      </div>

      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-1 flex-wrap gap-3">
          <div class="relative w-full sm:w-80">
            <Search
              class="text-muted-foreground pointer-events-none absolute top-2.5 left-3 h-4 w-4"
            />
            <Input
              v-model="search"
              type="search"
              placeholder="Buscar empresa"
              class="pl-9 w-full"
            />
          </div>
          <select
            v-if="accountantChips.length > 0"
            v-model="selectedAccountant"
            class="flex h-10 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:opacity-50"
          >
            <option v-for="chip in accountantChips" :key="chip.value" :value="chip.value">
              {{ chip.label }}
            </option>
          </select>
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

      <ul
        class="border-border bg-card divide-border divide-y rounded-xl border shadow-sm"
        role="list"
      >
        <li v-for="line in visible" :key="line.requestId" class="flex flex-col">
          <div class="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between">
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex items-center gap-2">
                <button
                  type="button"
                  class="hover:text-primary focus-visible:ring-ring flex items-center gap-2 text-left font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 rounded-sm"
                  :aria-expanded="isExpanded(line.companyId)"
                  @click="toggle(line.companyId)"
                >
                  <ChevronDown
                    class="text-muted-foreground h-4 w-4 transition-transform"
                    :class="{ '-rotate-90': !isExpanded(line.companyId) }"
                  />
                  {{ line.companyName }}
                </button>
                <StatusPill v-if="line.requestStatus === 'closed'" status="closed" />
                <span
                  v-else-if="line.overdue > 0"
                  class="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2 py-0.5 text-[11px] font-semibold text-danger"
                >
                  <TriangleAlert class="h-[10px] w-[10px]" /> Atrasada
                </span>
              </div>
              <p class="text-muted-foreground pl-6 text-xs tabular-nums">
                {{ maskedCnpj(line.cnpj) }}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-4 sm:justify-end">
              <div class="text-muted-foreground flex flex-col items-end text-sm">
                <span>{{ line.counts.accepted }} de {{ line.total }}</span>
                <span class="text-[11px]">{{ line.percent }}% completo</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                @click="doDownloadCompanyZip(line.requestId, line.companyName)"
              >
                <FileArchive class="mr-2 h-4 w-4" /> .zip
              </Button>
            </div>
          </div>

          <div
            v-if="isExpanded(line.companyId)"
            class="border-border bg-muted/20 border-t p-4 pt-3"
          >
            <div
              v-if="line.channelFailures.length"
              class="mb-4 rounded-lg border border-warning-border bg-warning-surface p-3 text-sm text-warning-foreground"
            >
              <div class="flex gap-2">
                <MailWarning
                  class="text-warning-foreground mt-0.5 shrink-0 text-base"
                  aria-hidden="true"
                />
                <div>
                  <p class="font-medium">
                    Falha na entrega de notificações ({{ uniqueFailures(line).join(', ') }})
                  </p>
                  <p class="mt-1 text-xs">
                    A última cobrança automática não pôde ser entregue. Verifique se o e-mail ou
                    número de telefone estão corretos no cadastro da empresa.
                  </p>
                  <div class="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      :disabled="resendingRequestId === line.requestId"
                      @click="handleResendUploadLink(line)"
                    >
                      <Mail class="mr-2 h-4 w-4" />
                      {{
                        resendingRequestId === line.requestId
                          ? 'Reenviando...'
                          : 'Gerar novo link e reenviar e-mail'
                      }}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <template v-if="line.missing.length === 0">
              <div class="flex items-center gap-2 text-sm text-success p-2">
                <CircleCheck class="h-4 w-4" /> Tudo conferido
              </div>
            </template>
            <template v-else>
              <h4
                class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1"
              >
                Aguardando Envio ({{ line.missing.length }})
              </h4>
              <ul class="border-border bg-card divide-border divide-y rounded-lg border shadow-sm">
                <li
                  v-for="item in line.missing"
                  :key="item.id"
                  class="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 gap-2"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-medium">{{ item.name }}</p>
                    <p v-if="item.status === 'rejected'" class="text-danger mt-0.5 text-xs">
                      Recusado: aguardando reenvio
                    </p>
                  </div>
                  <DueDate :date="item.dueDate" class="text-xs" />
                </li>
              </ul>
            </template>
          </div>
        </li>
      </ul>
    </template>
  </main>

  <Modal
    v-model:open="confirmClose"
    title="Encerrar competência?"
    description="Encerrar é a palavra final: as solicitações desta competência também são encerradas, mesmo com pendências."
  >
    <p class="text-sm">
      Os Responsáveis não poderão mais enviar documentos nos itens — apenas documentos extras.
    </p>
    <div
      class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
    >
      <Button variant="ghost" @click="confirmClose = false">Cancelar</Button>
      <Button
        variant="destructive"
        :disabled="closePeriodMutation.isPending.value"
        @click="handleClosePeriod"
      >
        {{ closePeriodMutation.isPending.value ? 'Encerrando...' : 'Encerrar competência' }}
      </Button>
    </div>
  </Modal>
</template>
