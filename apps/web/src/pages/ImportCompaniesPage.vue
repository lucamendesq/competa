<script setup lang="ts">
import { computed, ref, shallowRef } from 'vue';
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
import { COMPANY_FLAGS, type CompanyFlag } from '@competa/contracts';
import {
  importCsv as importCsvApi,
  confirmImport as confirmImportApi,
  sendAccessInvites,
} from '@/features/companies/api/companies';
import type {
  ImportPreviewLine,
  ImportPreviewResult,
  ImportResult,
} from '@/features/companies/api/companies';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';

const router = useRouter();

const FLAG_LABEL: Record<CompanyFlag, string> = {
  has_employees: 'Tem funcionários',
  accepts_card_payments: 'Aceita pagamento por cartão',
  has_inventory: 'Controla estoque',
};

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
  if (done) return { total: done.total, created: done.created, errors: done.failed };

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

const actionableCount = computed(() => confirmed.value?.created ?? pendingRows.value.length);

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

async function ensureConfirmed(): Promise<string[]> {
  const already = confirmed.value;
  if (already) {
    return already.lines
      .filter((line) => line.status === 'created')
      .map((line: any) => line.companyId);
  }

  const pending = pendingRows.value.map(({ line, body }) => ({ line, body }));
  if (!pending.length) return [];

  const result = await confirmImportApi(pending);
  confirmed.value = result;
  toast.success(
    result.created === 1 ? '1 empresa importada.' : `${result.created} empresas importadas.`,
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
    <Button variant="outline" as-child>
      <RouterLink to="/empresas">Voltar</RouterLink>
    </Button>
  </PageHeader>

  <main class="mt-8">
    <section v-if="preview" class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 class="text-base font-semibold">Resumo da importação</h2>
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
          <Button variant="outline" @click="restart">Importar outra planilha</Button>
          <Button :disabled="confirming" @click="finish">{{ finishLabel }}</Button>
        </div>
      </div>

      <div
        v-if="actionableCount"
        class="border-border bg-muted/40 flex flex-wrap items-center gap-3 border rounded-xl p-4"
      >
        <template v-if="invitesSent === null">
          <p class="text-muted-foreground min-w-0 flex-1 text-xs">
            A importação não avisa ninguém por e-mail — confira o relatório antes.
            <template v-if="confirmed"
              >Envie o convite de acesso para os Responsáveis cadastrados.</template
            >
            <template v-else>Enviar os convites agora também importa as empresas.</template>
          </p>
          <Button variant="outline" :disabled="inviting" @click="doSendInvites">
            <Mail class="mr-2 h-4 w-4" aria-hidden="true" />
            {{ inviting ? 'Enviando…' : 'Enviar convites de acesso (' + actionableCount + ')' }}
          </Button>
        </template>
        <template v-else>
          <p class="flex min-w-0 flex-1 items-center gap-2 text-xs text-success font-medium">
            <CircleCheck class="shrink-0 text-base" aria-hidden="true" />
            {{ invitesSent }}
            {{ invitesSent === 1 ? 'convite enviado' : 'convites enviados' }}. Quem já tinha convite
            em aberto não recebeu outro.
          </p>
        </template>
      </div>

      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Linha</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Resultado</TableHead>
                <TableHead>Detalhe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="line in displayLines" :key="line.line">
                <TableCell class="tabular-nums text-muted-foreground">{{ line.line }}</TableCell>
                <TableCell class="font-medium">{{ line.name || '—' }}</TableCell>
                <TableCell>
                  <span
                    v-if="line.status === 'created'"
                    class="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-surface px-2 py-0.5 text-[11px] font-semibold text-success"
                  >
                    <CircleCheck class="h-[12px] w-[12px]" aria-hidden="true" /> Importada
                  </span>
                  <span
                    v-else-if="line.status === 'pending'"
                    class="text-muted-foreground border-border inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  >
                    <Clock class="h-[12px] w-[12px]" aria-hidden="true" /> Pronta
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2 py-0.5 text-[11px] font-semibold text-danger"
                  >
                    <CircleAlert class="h-[12px] w-[12px]" aria-hidden="true" /> Erro
                  </span>
                </TableCell>
                <TableCell class="text-muted-foreground text-xs">
                  <template v-if="line.status === 'error'">{{ line.error }}</template>
                  <template v-else-if="line.status === 'created'">Empresa criada.</template>
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
          class="bg-card rounded-xl border-2 border-dashed p-8 text-center transition-colors"
          :class="dragging ? 'border-primary bg-primary/5' : 'border-border'"
          @dragover.prevent="dragging = true"
          @dragleave="dragging = false"
          @drop="drop"
        >
          <span
            class="bg-muted text-muted-foreground mx-auto flex size-12 items-center justify-center rounded-full"
          >
            <Upload class="text-xl h-6 w-6" aria-hidden="true" />
          </span>

          <p class="mt-4 text-sm font-medium">
            Arraste sua planilha (.xlsx ou .csv) aqui ou escolha o arquivo
          </p>
          <p class="text-muted-foreground mt-1 text-xs">
            Aceita o .xlsx exportado do seu sistema ou um CSV. Só a primeira aba é lida.
          </p>

          <label
            class="bg-primary text-primary-foreground hover:bg-primary/90 focus-within:ring-ring mt-5 inline-flex h-9 cursor-pointer items-center rounded-md px-3 text-sm font-medium focus-within:ring-2"
          >
            Escolher arquivo
            <input
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              class="sr-only"
              @change="choose"
            />
          </label>

          <p v-if="file" class="mt-4 text-sm">
            Arquivo selecionado: <strong>{{ file.name }}</strong>
          </p>
        </div>

        <div class="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" @click="downloadTemplate">
            <Download class="mr-2 h-4 w-4" aria-hidden="true" /> Baixar planilha modelo
          </Button>
          <div class="flex flex-col items-end gap-1">
            <Button :disabled="!file || sending" aria-describedby="import-help" @click="importCsv">
              {{ sending ? 'Importando…' : 'Importar empresas' }}
            </Button>
            <p id="import-help" class="text-muted-foreground text-xs">
              <template v-if="!file">Escolha a planilha acima para liberar a importação.</template>
              <template v-else>{{ file.name }} pronto para importar.</template>
            </p>
          </div>
        </div>
      </section>

      <aside class="bg-card border-border h-fit rounded-xl border shadow-sm">
        <div class="border-border border-b p-4">
          <h2 class="text-sm font-semibold">Colunas esperadas</h2>
          <p class="text-muted-foreground mt-1 text-xs">
            A primeira linha da planilha precisa ter estes nomes de coluna (variações como "Razão
            Social", "E-mail do responsável" e "WhatsApp" também são aceitas).
          </p>
        </div>
        <ul class="divide-border divide-y">
          <li v-for="column in COLUMNS" :key="column.key" class="p-3">
            <p class="text-sm font-semibold">{{ column.header }}</p>
            <p class="text-muted-foreground mt-0.5 text-xs">
              <span v-if="column.required" class="text-foreground font-medium">Obrigatória</span>
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
