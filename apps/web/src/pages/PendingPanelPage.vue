<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  BellRing,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardCheck,
  FileArchive,
  Link,
  Lock,
  Mail,
  MailWarning,
  PartyPopper,
  Plus,
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
import { addMissingRequests, getPendingPanel } from '@/features/periods/api/periods';
import {
  resendUploadLink,
  getUploadLink,
  downloadRequestZip,
} from '@/features/requests/api/requests';
import { useQuery } from '@tanstack/vue-query';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import { useCopy } from '@/composables/useCopy';
import { useAuthStore } from '@/stores/auth';
import PlanGateNotice from '@/components/PlanGateNotice.vue';
import { planGateMessage } from '@competa/contracts';
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

const auth = useAuthStore();
const canPeriodZip = computed(() => auth.can('periodZip'));
const periodZipHint = planGateMessage('periodZip');

async function doDownloadPeriodZip() {
  const reference = detailQuery.data.value?.referenceMonth ?? '';
  try {
    await downloadPeriodZip(props.id, reference);
    toast.success('Download da competência concluído.');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
  }
}

async function doDownloadCompanyZip(requestId: string, companyName: string) {
  try {
    await downloadRequestZip(requestId, `${slug(companyName)}.zip`);
    toast.success(`Download de ${companyName} concluído.`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível baixar o zip.'));
  }
}

const resendingRequestId = ref<string | null>(null);
const copyingRequestId = ref<string | null>(null);
const { copiedKey, copy } = useCopy();

async function handleCopyUploadLink(line: any) {
  copyingRequestId.value = line.requestId;
  try {
    const link = await getUploadLink(line.requestId);
    await copy(
      link.uploadUrl,
      `Novo link de ${line.companyName} copiado — o link anterior deixou de funcionar.`,
      line.requestId,
    );
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível gerar o link.'));
  } finally {
    copyingRequestId.value = null;
  }
}

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

const addingRequests = ref(false);

/* Empresa cadastrada ou ativada depois da abertura fica fora da Competência até alguém
 * pedir: o fan-out da abertura roda uma vez só. */
async function includeNewCompanies() {
  addingRequests.value = true;
  try {
    const { requests, warnings } = await addMissingRequests(props.id);
    if (requests.length) {
      toast.success(
        requests.length === 1
          ? `Link enviado para ${requests[0].companyName}.`
          : `${requests.length} empresas incluídas e links enviados.`,
      );
    } else {
      toast.info(
        warnings.length
          ? `Nenhuma empresa incluída: ${warnings.map((w) => `${w.companyName} (${w.reason})`).join('; ')}.`
          : 'Todas as empresas ativas já estão nesta competência.',
      );
    }
    detailQuery.refetch();
    panelQuery.refetch();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível incluir as empresas novas.'));
  } finally {
    addingRequests.value = false;
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
  <PlanGateNotice v-if="!canPeriodZip" capability="periodZip" class="mb-4">
    Baixar o zip da competência inteira (o zip por empresa continua liberado)
  </PlanGateNotice>

  <PageHeader
    :title="
      'Cobrança da competência ' +
      (detailQuery.data.value?.referenceMonth
        ? monthLabel(detailQuery.data.value.referenceMonth)
        : '')
    "
    description="Acompanhe o painel de pendências desta competência."
  >
    <span class="mr-2 inline-block" :title="canPeriodZip ? undefined : periodZipHint">
      <Button
        variant="outline"
        class="shadow-xs"
        :disabled="!canPeriodZip"
        @click="doDownloadPeriodZip"
      >
        <FileArchive class="mr-2 h-4 w-4" /> Baixar Tudo (.zip)
      </Button>
    </span>
    <template v-if="detailQuery.data.value?.status === 'open'">
      <Button
        variant="outline"
        class="mr-2 shadow-xs"
        :disabled="addingRequests"
        @click="includeNewCompanies"
      >
        <Plus class="mr-2 h-4 w-4" />
        {{ addingRequests ? 'Incluindo...' : 'Incluir empresas novas' }}
      </Button>
      <Button
        variant="outline"
        class="text-danger hover:text-danger hover:bg-danger-surface border-border shadow-xs"
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
        class="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-5 sm:flex-row sm:items-center sm:justify-between shadow-sm"
      >
        <div>
          <h2 class="text-base font-semibold font-display text-foreground">
            Competência encerrada
          </h2>
          <p class="text-muted-foreground mt-1 text-sm">
            Os itens pendentes e rejeitados não podem mais receber arquivos.
          </p>
        </div>
        <StatusPill status="closed" />
      </div>
      <div
        v-else-if="allDelivered"
        class="mb-8 flex flex-wrap items-center gap-4 rounded-xl border border-success-border bg-success-surface p-5 sm:p-6 shadow-sm"
      >
        <div
          class="flex h-12 w-12 items-center justify-center rounded-xl bg-success/15 text-success shrink-0"
        >
          <PartyPopper class="h-6 w-6 text-success" aria-hidden="true" />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-semibold font-display text-success-foreground">
            Zero pendências! 🎉
          </h2>
          <p class="mt-1 text-sm text-success-foreground">
            Todos os {{ sendProgress.total }} documentos exigidos pelas solicitações ativas foram
            enviados e conferidos.
          </p>
        </div>
      </div>
      <div
        v-else
        class="bg-card border-border mb-8 flex flex-col gap-4 rounded-xl border p-5 sm:p-6 shadow-sm"
      >
        <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 class="text-base font-semibold font-display text-foreground">
              Progresso geral da competência
            </h2>
            <p class="text-muted-foreground mt-1 text-sm flex items-center gap-1.5">
              <span class="font-display font-bold text-foreground tabular-nums">{{
                sendProgress.accepted
              }}</span>
              de
              <span class="font-display font-bold text-foreground tabular-nums">{{
                sendProgress.total
              }}</span>
              documentos entregues e conferidos
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="font-display text-2xl font-bold text-brand tabular-nums">
              {{ sendProgress.percent }}%
            </span>
            <Button
              variant="outline"
              size="sm"
              class="shadow-xs"
              :disabled="runRemindersMutation.isPending.value"
              @click="resendReminders"
            >
              <BellRing class="mr-2 h-4 w-4" />
              {{ runRemindersMutation.isPending.value ? 'Disparando...' : 'Cobrar atrasados' }}
            </Button>
          </div>
        </div>
        <div
          class="bg-sunken mt-2 h-3 w-full overflow-hidden rounded-full p-0.5 border border-border-subtle"
        >
          <div
            class="bg-brand h-full rounded-full transition-all duration-500 ease-out"
            :style="{ width: sendProgress.percent + '%' }"
          ></div>
        </div>
      </div>

      <div class="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex flex-1 flex-wrap gap-3">
          <div class="relative w-full sm:w-80">
            <Search
              class="text-muted-foreground pointer-events-none absolute top-3 left-3 h-4 w-4"
            />
            <Input
              v-model="search"
              type="search"
              placeholder="Buscar empresa"
              class="pl-9 w-full bg-card shadow-xs focus-visible:ring-ring focus-visible:border-primary"
            />
          </div>
          <select
            v-if="accountantChips.length > 0"
            v-model="selectedAccountant"
            class="flex h-10 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary text-foreground disabled:opacity-50"
          >
            <option v-for="chip in accountantChips" :key="chip.value" :value="chip.value">
              {{ chip.label }}
            </option>
          </select>
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

      <div class="space-y-3" role="list">
        <div
          v-for="line in visible"
          :key="line.requestId"
          class="bg-card border-border rounded-xl border shadow-xs overflow-hidden transition-all duration-150"
          role="listitem"
        >
          <div
            class="flex flex-col gap-4 p-4 sm:p-5 sm:flex-row sm:items-center sm:justify-between"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-1.5">
              <div class="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="group flex items-center gap-2.5 text-left font-semibold text-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md py-0.5"
                  :aria-expanded="isExpanded(line.companyId)"
                  @click="toggle(line.companyId)"
                >
                  <ChevronDown
                    class="text-muted-foreground group-hover:text-primary h-4 w-4 transition-transform duration-200"
                    :class="{ '-rotate-90': !isExpanded(line.companyId) }"
                  />
                  <span
                    class="font-display text-base font-semibold text-foreground group-hover:text-primary transition-colors"
                  >
                    {{ line.companyName }}
                  </span>
                </button>
                <StatusPill v-if="line.requestStatus === 'closed'" status="closed" />
                <span
                  v-else-if="line.overdue > 0"
                  class="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2.5 py-0.5 text-[11px] font-semibold text-danger-foreground"
                >
                  <TriangleAlert class="h-3 w-3 text-danger" /> Atrasada
                </span>
              </div>
              <p class="text-muted-foreground pl-6 text-xs tabular-nums">
                {{ maskedCnpj(line.cnpj) }}
              </p>
            </div>
            <div class="flex shrink-0 flex-wrap items-center gap-3 sm:justify-end">
              <div class="text-muted-foreground flex flex-col sm:items-end text-xs sm:text-sm">
                <span class="font-medium text-foreground">
                  <span class="tabular-nums font-semibold">{{ line.counts.accepted }}</span> de
                  <span class="tabular-nums font-semibold">{{ line.total }}</span>
                </span>
                <span class="text-[11px] text-muted-foreground tabular-nums"
                  >{{ line.percent }}% completo</span
                >
              </div>
              <div class="flex items-center gap-2 flex-wrap">
                <Button
                  :variant="line.counts.submitted > 0 ? 'default' : 'outline'"
                  size="sm"
                  class="shadow-xs font-medium"
                  as-child
                >
                  <RouterLink :to="`/solicitacoes/${line.requestId}`">
                    <ClipboardCheck class="mr-2 h-4 w-4" />
                    {{
                      line.counts.submitted > 0 ? `Conferir (${line.counts.submitted})` : 'Envios'
                    }}
                  </RouterLink>
                </Button>
                <Button
                  v-if="line.requestStatus !== 'closed'"
                  variant="outline"
                  size="sm"
                  class="shadow-xs"
                  :disabled="copyingRequestId === line.requestId"
                  @click="handleCopyUploadLink(line)"
                >
                  <Check v-if="copiedKey === line.requestId" class="mr-2 h-4 w-4 text-success" />
                  <Link v-else class="mr-2 h-4 w-4" />
                  <template v-if="copiedKey === line.requestId">Link copiado!</template>
                  <template v-else>{{
                    copyingRequestId === line.requestId ? 'Gerando...' : 'Copiar link'
                  }}</template>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  class="shadow-xs"
                  @click="doDownloadCompanyZip(line.requestId, line.companyName)"
                >
                  <FileArchive class="mr-2 h-4 w-4" /> .zip
                </Button>
              </div>
            </div>
          </div>

          <div
            v-if="isExpanded(line.companyId)"
            class="border-border bg-sunken/40 border-t p-4 sm:p-5"
          >
            <div
              v-if="line.channelFailures.length"
              class="mb-4 rounded-xl border border-danger-border bg-danger-surface p-4 text-sm text-danger-foreground"
            >
              <div class="flex gap-3">
                <MailWarning class="text-danger mt-0.5 shrink-0 text-lg" aria-hidden="true" />
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-danger-foreground">
                    Falha na entrega de notificações ({{ uniqueFailures(line).join(', ') }})
                  </p>
                  <p class="mt-1 text-xs text-danger-foreground/90 leading-relaxed">
                    A última cobrança automática não pôde ser entregue. Verifique se o e-mail ou
                    número de telefone estão corretos no cadastro da empresa.
                  </p>
                  <div class="mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      class="border-danger-border bg-white text-danger-foreground hover:bg-danger-surface shadow-xs"
                      :disabled="resendingRequestId === line.requestId"
                      @click="handleResendUploadLink(line)"
                    >
                      <Mail class="mr-2 h-4 w-4 text-danger" />
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
              <div class="flex items-center gap-2 text-sm text-success font-medium p-2">
                <CircleCheck class="h-4 w-4 text-success" /> Tudo conferido
              </div>
            </template>
            <template v-else>
              <h4
                class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2.5 px-1"
              >
                Aguardando Envio ({{ line.missing.length }})
              </h4>
              <ul
                class="border-border bg-card divide-border divide-y rounded-xl border shadow-xs overflow-hidden"
              >
                <li
                  v-for="item in line.missing"
                  :key="item.id"
                  class="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 gap-2 hover:bg-slate-50/75 transition-colors"
                >
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-foreground">{{ item.name }}</p>
                    <p
                      v-if="item.status === 'rejected'"
                      class="text-danger mt-0.5 text-xs font-medium"
                    >
                      Recusado: aguardando reenvio
                    </p>
                  </div>
                  <DueDate :date="item.dueDate" class="text-xs shrink-0" />
                </li>
              </ul>
            </template>
          </div>
        </div>
      </div>
    </template>
  </main>

  <Modal
    v-model:open="confirmClose"
    title="Encerrar competência?"
    description="Encerrar é a palavra final: as solicitações desta competência também são encerradas, mesmo com pendências."
  >
    <p class="text-sm text-foreground">
      Os Responsáveis não poderão mais enviar documentos nos itens — apenas documentos extras.
    </p>
    <div
      class="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex flex-wrap justify-end gap-2.5 border-t p-4"
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
