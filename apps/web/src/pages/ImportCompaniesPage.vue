<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Upload, Download, Clock, CircleAlert, CircleCheck, Mail } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PageHeader from '@/components/PageHeader.vue';
import Modal from '@/components/Modal.vue';
import Callout from '@/components/Callout.vue';
import { COMPANY_FLAGS } from '@competa/contracts';
import { FLAG_LABEL } from '@/utils/format';
import {
  importCsv as importCsvApi,
  confirmImport as confirmImportApi,
  sendAccessInvites,
} from '@/features/companies/api/companies';
import { usePlanUsage } from '@/features/companies/composables/usePlanUsage';
import type {
  ImportPreviewLine,
  ImportPreviewResult,
  ImportResult,
} from '@/features/companies/api/companies';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';

const router = useRouter();

const COLUMNS = [
  { header: 'Empresa', key: 'name', required: true },
  { header: 'CNPJ', key: 'cnpj', required: false },
  { header: 'Responsável', key: 'contact_name', required: false },
  { header: 'E-mail do responsável', key: 'contact_email', required: false },
  { header: 'Telefone', key: 'contact_phone', required: false },
  ...COMPANY_FLAGS.map((flag) => ({
    header: FLAG_LABEL[flag],
    key: `flag_${flag}`,
    label: 'Sim ou Não',
    required: false,
  })),
];

const file = shallowRef<{ name: string; content: string } | null>(null);
const sending = ref(false);
const dragging = ref(false);
const error = ref<string | null>(null);

const preview = shallowRef<ImportPreviewResult | null>(null);
const confirmed = shallowRef<ImportResult | null>(null);
const confirming = ref(false);

const summary = computed(() => {
  const done = confirmed.value;
  if (done) return { total: done.total, created: done.created + done.updated, errors: done.failed };

  const current = preview.value;
  return { total: current?.total ?? 0, created: 0, errors: current?.failed ?? 0 };
});

const pendingRows = computed(() => {
  return (preview.value?.lines ?? []).filter((line) => line.status === 'pending') as Extract<
    ImportPreviewLine,
    { status: 'pending' }
  >[];
});

const displayLines = computed(() => {
  const errorLines = (preview.value?.lines ?? []).filter((line) => line.status === 'error');
  const done = confirmed.value;
  return [...errorLines, ...(done ? done.lines : pendingRows.value)].sort(
    (a, b) => a.line - b.line,
  );
});

const { data: usageData } = usePlanUsage();
const activate = ref(true);

/** Quantas das linhas prontas entram ativas: o resto fica inativo, sem ocupar vaga e sem
 *  recusar a importação. O padrão vira "importar como inativas" quando o lote estoura o
 *  teto — é o caso em que a escolha realmente importa. */
const split = computed(() => {
  const usage = usageData.value;
  const ready = pendingRows.value.length;
  const slots = usage ? Math.max(0, usage.softCap - usage.companiesActive) : ready;
  const active = activate.value ? Math.min(ready, slots) : 0;

  return { ready, active, inactive: ready - active, usage };
});

watch(
  () => [usageData.value, preview.value] as const,
  () => {
    const usage = usageData.value;
    if (!usage || !preview.value) return;
    activate.value = pendingRows.value.length <= usage.softCap - usage.companiesActive;
  },
);

const actionableCount = computed(() =>
  confirmed.value ? confirmed.value.created + confirmed.value.updated : pendingRows.value.length,
);

const finishLabel = computed(() => {
  if (confirming.value) return 'Importando…';
  if (confirmed.value || !actionableCount.value) return 'Concluir';
  return actionableCount.value === 1
    ? 'Importar 1 empresa'
    : `Importar ${actionableCount.value} empresas`;
});

async function read(f: File) {
  error.value = null;

  if (/\.xlsx?$/i.test(f.name)) {
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await f.arrayBuffer(), { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      file.value = { name: f.name, content: XLSX.utils.sheet_to_csv(firstSheet) };
    } catch {
      error.value = 'Não foi possível ler esta planilha. Exporte como CSV e tente de novo.';
    }
    return;
  }

  if (!/\.csv$/i.test(f.name)) {
    error.value = 'Envie um arquivo .csv ou .xlsx.';
    return;
  }

  file.value = { name: f.name, content: await f.text() };
}

async function choose(event: Event) {
  const input = event.target as HTMLInputElement;
  const f = input.files?.[0];
  if (f) await read(f);
}

async function drop(event: DragEvent) {
  event.preventDefault();
  dragging.value = false;
  const f = event.dataTransfer?.files?.[0];
  if (f) await read(f);
}

async function importCsv() {
  const current = file.value;
  if (!current) return;

  sending.value = true;
  error.value = null;

  try {
    preview.value = await importCsvApi(current.content);
  } catch (err) {
    error.value = apiErrorMessage(err, 'Não foi possível ler a planilha.');
  } finally {
    sending.value = false;
  }
}

const confirmRestart = ref(false);
const inviting = ref(false);
const invitesSent = ref<number | null>(null);

/* Os dois botões ("Enviar convites" e "Importar") confirmam a importação. Cada um só se
 * desabilitava no próprio estado, e clicar nos dois disparava dois confirms: linha sem
 * CNPJ não tem chave para o upsert e entrava duplicada. Agora a confirmação em curso é
 * uma só, e os dois botões ficam desabilitados enquanto ela roda. */
let confirmInFlight: Promise<string[]> | null = null;
const busy = computed(() => confirming.value || inviting.value);

function ensureConfirmed(): Promise<string[]> {
  confirmInFlight ??= confirmOnce().finally(() => {
    confirmInFlight = null;
  });
  return confirmInFlight;
}

async function confirmOnce(): Promise<string[]> {
  const already = confirmed.value;
  if (already) {
    return already.lines
      .filter((line) => line.status === 'created')
      .map((line: any) => line.companyId);
  }

  const pending = pendingRows.value.map(({ line, body }) => ({ line, body }));
  if (!pending.length) return [];

  const result = await confirmImportApi(pending, activate.value);
  confirmed.value = result;
  const updated = result.updated ? ` ${result.updated} já cadastrada(s) atualizada(s).` : '';
  toast.success(
    `${result.created} ${result.created === 1 ? 'empresa nova' : 'empresas novas'}` +
      ` — ${result.activated} ativa(s), ${result.created - result.activated} inativa(s).` +
      updated,
  );

  return result.lines
    .filter((line: any) => line.status === 'created')
    .map((line: any) => line.companyId);
}

async function doSendInvites() {
  inviting.value = true;
  try {
    const companyIds = await ensureConfirmed();
    const result = await sendAccessInvites(companyIds);
    invitesSent.value = result.invited;
    toast.success(
      result.invited === 1
        ? '1 convite de acesso enviado.'
        : `${result.invited} convites de acesso enviados.`,
    );
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Não foi possível enviar os convites.'));
  } finally {
    inviting.value = false;
  }
}

async function finish() {
  confirming.value = true;
  try {
    await ensureConfirmed();
    router.push('/empresas');
  } catch (err) {
    toast.error(apiErrorMessage(err, 'Não foi possível concluir a importação.'));
  } finally {
    confirming.value = false;
  }
}

function restart() {
  if (confirmed.value) discard();
  else confirmRestart.value = true;
}

function discard() {
  confirmRestart.value = false;
  file.value = null;
  preview.value = null;
  confirmed.value = null;
  error.value = null;
  invitesSent.value = null;
}

function downloadTemplate() {
  const header = COLUMNS.map((column) => column.header).join(',');
  const example = [
    'Padaria Pão Quente Ltda',
    '11.222.333/0001-81',
    'Maria Souza',
    'maria@padaria.com.br',
    '(11) 98888-7777',
    'Sim',
    'Não',
    'Não',
  ].join(',');

  const blob = new Blob([`${header}\n${example}\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = 'modelo-empresas.csv';
  anchor.click();
  URL.revokeObjectURL(url);
}
</script>

<template>
  <PageHeader
    title="Importar Empresas"
    description="Adicione suas empresas em lote, importando do sistema contábil."
  >
    <Button variant="outline" as-child class="shadow-xs">
      <RouterLink to="/empresas">Voltar</RouterLink>
    </Button>
  </PageHeader>

  <main class="mt-8">
    <section v-if="preview" class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="font-display text-base font-semibold text-foreground">Resumo da importação</h2>
          <p class="text-muted-foreground mt-1 text-sm">
            <template v-if="confirmed">
              {{ summary.created }} importadas &middot; {{ summary.errors }} com erro &middot;
              {{ summary.total }} linhas lidas
            </template>
            <template v-else>
              {{ actionableCount }} prontas para importar &middot; {{ summary.errors }} com erro
              &middot; {{ summary.total }} linhas lidas — nada foi criado ainda
            </template>
          </p>
        </div>
        <div class="flex gap-2">
          <Button variant="outline" class="shadow-xs" @click="restart"
            >Importar outra planilha</Button
          >
          <Button :disabled="busy" class="shadow-xs font-medium" @click="finish">{{
            finishLabel
          }}</Button>
        </div>
      </div>

      <div
        v-if="!confirmed && split.ready"
        class="border-border bg-card shadow-xs flex flex-col gap-3 rounded-xl border p-4 sm:p-5"
      >
        <p class="text-foreground text-sm">
          <strong>{{ split.ready }}</strong>
          {{ split.ready === 1 ? 'empresa será importada' : 'empresas serão importadas' }}.
          <template v-if="split.usage">
            <strong>{{ split.active }}</strong>
            {{ split.active === 1 ? 'ficará ativa' : 'ficarão ativas' }} (seu plano cobre
            {{ split.usage.companyCap }} e você já tem {{ split.usage.companiesActive }}) e
            <strong>{{ split.inactive }}</strong>
            {{ split.inactive === 1 ? 'ficará inativa' : 'ficarão inativas' }} — ative quando
            quiser.
          </template>
        </p>

        <label class="flex items-start gap-2 text-sm">
          <input
            v-model="activate"
            type="checkbox"
            class="accent-primary focus-visible:ring-ring mt-0.5 size-4 focus-visible:ring-2 focus-visible:outline-none"
          />
          <span class="text-muted-foreground">
            Ativar as que couberem no teto do plano. Desmarque para
            <strong>importar a carteira inteira como inativa</strong> — empresa inativa não ocupa
            vaga e não entra no disparo da competência.
          </span>
        </label>
      </div>

      <div
        v-if="actionableCount"
        class="border-border bg-card shadow-xs flex flex-wrap items-center gap-3 border rounded-xl p-4 sm:p-5"
      >
        <template v-if="invitesSent === null">
          <p class="text-muted-foreground min-w-0 flex-1 text-xs sm:text-sm">
            A importação não avisa ninguém por e-mail — confira o relatório antes.
            <template v-if="confirmed"
              >Envie o convite de acesso para os Responsáveis cadastrados.</template
            >
            <template v-else>Enviar os convites agora também importa as empresas.</template>
          </p>
          <Button
            variant="outline"
            :disabled="busy"
            class="shadow-xs font-medium"
            @click="doSendInvites"
          >
            <Mail class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ inviting ? 'Enviando…' : 'Enviar convites de acesso (' + actionableCount + ')' }}
          </Button>
        </template>
        <template v-else>
          <p
            class="flex min-w-0 flex-1 items-center gap-2 text-xs sm:text-sm text-success font-medium"
          >
            <CircleCheck class="shrink-0 h-4 w-4" aria-hidden="true" />
            {{ invitesSent }}
            {{ invitesSent === 1 ? 'convite enviado' : 'convites enviados' }}. Quem já tinha convite
            em aberto não recebeu outro.
          </p>
        </template>
      </div>

      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader class="bg-sunken/60">
              <TableRow class="hover:bg-transparent border-border">
                <TableHead class="font-semibold text-foreground">Linha</TableHead>
                <TableHead class="font-semibold text-foreground">Empresa</TableHead>
                <TableHead class="font-semibold text-foreground">Resultado</TableHead>
                <TableHead class="font-semibold text-foreground">Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="line in displayLines"
                :key="line.line"
                class="border-border hover:bg-slate-50/75 transition-colors"
              >
                <TableCell class="tabular-nums text-muted-foreground">{{ line.line }}</TableCell>
                <TableCell class="font-medium font-display text-foreground">{{
                  line.name || '—'
                }}</TableCell>
                <TableCell>
                  <span
                    v-if="line.status === 'created'"
                    class="inline-flex items-center gap-1.5 rounded-full border border-success-border bg-success-surface px-2.5 py-0.5 text-xs font-semibold text-success"
                  >
                    <CircleCheck class="h-3.5 w-3.5" aria-hidden="true" /> Importada
                  </span>
                  <span
                    v-else-if="line.status === 'pending'"
                    class="text-muted-foreground border-border bg-muted/60 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold"
                  >
                    <Clock class="h-3.5 w-3.5" aria-hidden="true" /> Pronta
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1.5 rounded-full border border-danger-border bg-danger-surface px-2.5 py-0.5 text-xs font-semibold text-danger"
                  >
                    <CircleAlert class="h-3.5 w-3.5" aria-hidden="true" /> Erro
                  </span>
                </TableCell>
                <TableCell class="text-muted-foreground text-xs sm:text-sm">
                  <template v-if="line.status === 'error'">{{ line.error }}</template>
                  <template v-else-if="line.status === 'created'">
                    {{ line.active ? 'Empresa criada e ativa.' : 'Empresa criada, inativa.' }}
                  </template>
                  <template v-else>Aguardando confirmação.</template>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </section>

    <div v-else class="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
      <section class="flex flex-col gap-4">
        <Callout v-if="error" tone="danger" :heading="error" />

        <div
          class="bg-card rounded-xl border-2 border-dashed p-8 sm:p-10 text-center transition-colors shadow-xs"
          :class="
            dragging ? 'border-primary/50 bg-primary/5' : 'border-border hover:border-primary/40'
          "
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop="drop"
        >
          <span
            class="bg-primary/10 text-primary mx-auto flex size-12 items-center justify-center rounded-full mb-4 shadow-xs"
          >
            <Upload class="h-6 w-6" aria-hidden="true" />
          </span>

          <p class="text-sm font-semibold font-display text-foreground">
            Arraste sua planilha (.xlsx ou .csv) aqui ou escolha o arquivo
          </p>
          <p class="text-muted-foreground mt-1 text-xs">
            Aceita o .xlsx exportado do seu sistema ou um CSV. Só a primeira aba é lida.
          </p>

          <label
            class="bg-primary text-primary-foreground hover:bg-primary/90 focus-within:ring-ring mt-5 inline-flex h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium focus-within:ring-2 shadow-xs transition-colors"
          >
            Escolher arquivo
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="sr-only"
              @change="choose"
            />
          </label>

          <p v-if="file" class="mt-4 text-sm text-foreground">
            Arquivo selecionado: <strong class="font-semibold text-primary">{{ file.name }}</strong>
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" class="shadow-xs font-medium" @click="downloadTemplate">
            <Download class="mr-2 h-4 w-4" aria-hidden="true" /> Baixar planilha modelo
          </Button>
          <div class="flex flex-col items-end gap-1">
            <Button
              :disabled="!file || sending"
              class="shadow-xs font-medium"
              aria-describedby="import-help"
              @click="importCsv"
            >
              {{ sending ? 'Importando…' : 'Importar empresas' }}
            </Button>
            <p id="import-help" class="text-muted-foreground text-xs">
              <template v-if="!file">Escolha a planilha acima para liberar a importação.</template>
              <template v-else>{{ file.name }} pronto para importar.</template>
            </p>
          </div>
        </div>
      </section>

      <aside class="bg-card border-border h-fit rounded-xl border shadow-sm overflow-hidden">
        <div class="bg-sunken/60 border-border border-b p-4">
          <h2 class="text-sm font-semibold font-display text-foreground">Colunas esperadas</h2>
          <p class="text-muted-foreground mt-1 text-xs">
            A primeira linha da planilha precisa ter estes nomes de coluna (variações como "Razão
            Social", "E-mail do responsável" e "WhatsApp" também são aceitas).
          </p>
        </div>
        <ul class="divide-border divide-y">
          <li
            v-for="column in COLUMNS"
            :key="column.key"
            class="p-3.5 hover:bg-slate-50/75 transition-colors"
          >
            <p class="text-sm font-semibold text-foreground">{{ column.header }}</p>
            <p class="text-muted-foreground mt-0.5 text-xs">
              <span v-if="column.required" class="text-primary font-medium">Obrigatória</span>
              <template v-else>Opcional</template>
              <template v-if="'label' in column ? column.label : ''">
                &middot; {{ 'label' in column ? column.label : '' }}</template
              >
            </p>
          </li>
        </ul>
      </aside>
    </div>
  </main>

  <Modal
    :open="confirmRestart"
    @update:open="$event ? null : (confirmRestart = false)"
    title="Descartar esta planilha?"
    description="As empresas lidas ainda não foram criadas. Ao trocar de planilha você perde o que foi lido e precisa enviar tudo de novo."
  >
    <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="confirmRestart = false">Cancelar</Button>
      <Button variant="destructive" @click="discard">Descartar</Button>
    </div>
  </Modal>
</template>
