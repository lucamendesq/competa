<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { Mail, RotateCcw } from 'lucide-vue-next';
import { toast } from 'vue-sonner';
import { MESSAGE_CHANNELS, MESSAGE_PURPOSES, MESSAGE_STATUS } from '@competa/contracts';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import PageHeader from '@/components/PageHeader.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import StatusPill from '@/components/StatusPill.vue';
import EmptyState from '@/components/ui/empty/EmptyState.vue';
import { getMessages, resendMessage, type Message } from '@/features/messages/api/messages';
import { useCompaniesFeature } from '@/features/companies/composables/useCompaniesFeature';
import { apiErrorMessage } from '@/api/error';
import { dateTimeBr } from '@/utils/format';

const CHANNEL_LABEL: Record<Message['channel'], string> = {
  email: 'E-mail',
  whatsapp: 'WhatsApp',
  push: 'Push',
};

const PURPOSE_LABEL: Record<Message['purpose'], string> = {
  link_delivery: 'Envio do link',
  resend: 'Reenvio do link',
  reminder: 'Lembrete',
  rejection: 'Recusa',
  deadline_missed: 'Prazo vencido',
  completion: 'Conclusão',
};

const STATUS_LABEL: Record<Message['status'], string> = {
  queued: 'Na fila',
  sent: 'Enviada',
  delivered: 'Entregue',
  failed: 'Falhou',
};

const page = ref(1);
const perPage = 20;
const companyId = ref('');
const channel = ref('');
const purpose = ref('');
const status = ref('');

watch([companyId, channel, purpose, status], () => {
  page.value = 1;
});

const filters = computed(() => ({
  page: page.value,
  perPage,
  companyId: companyId.value || undefined,
  channel: (channel.value || undefined) as Message['channel'] | undefined,
  purpose: (purpose.value || undefined) as Message['purpose'] | undefined,
  status: (status.value || undefined) as Message['status'] | undefined,
}));

const messagesQuery = useQuery({
  queryKey: computed(() => ['messages', filters.value]),
  queryFn: () => getMessages(filters.value),
});

const messages = computed(() => messagesQuery.data.value?.data ?? []);
const total = computed(() => messagesQuery.data.value?.meta.total ?? 0);
const filtered = computed(
  () => !!(companyId.value || channel.value || purpose.value || status.value),
);

const { companiesQuery } = useCompaniesFeature(ref(1), ref(100));
const companies = computed(() => companiesQuery.data.value?.data ?? []);

const resendingId = ref<string | null>(null);

async function resend(row: Message) {
  resendingId.value = row.id;
  try {
    const { sent } = await resendMessage(row.id);
    if (sent) toast.success(`Mensagem reenviada para ${row.recipient}.`);
    else
      toast.error(
        `Não foi possível entregar a mensagem para ${row.recipient}. Confira o cadastro da empresa.`,
      );
    messagesQuery.refetch();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível reenviar a mensagem.'));
  } finally {
    resendingId.value = null;
  }
}

const selectClass =
  'flex h-10 rounded-md border border-input bg-card px-3 py-2 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary text-foreground';
</script>

<template>
  <PageHeader
    title="Mensagens"
    description="Log de entrega dos e-mails, WhatsApp e push enviados aos Responsáveis."
  />

  <section class="mt-8">
    <div class="mb-6 flex flex-wrap gap-3">
      <select v-model="companyId" aria-label="Empresa" :class="selectClass">
        <option value="">Todas as empresas</option>
        <option v-for="company in companies" :key="company.id" :value="company.id">
          {{ company.name }}
        </option>
      </select>
      <select v-model="channel" aria-label="Canal" :class="selectClass">
        <option value="">Todos os canais</option>
        <option v-for="value in MESSAGE_CHANNELS" :key="value" :value="value">
          {{ CHANNEL_LABEL[value] }}
        </option>
      </select>
      <select v-model="purpose" aria-label="Tipo" :class="selectClass">
        <option value="">Todos os tipos</option>
        <option v-for="value in MESSAGE_PURPOSES" :key="value" :value="value">
          {{ PURPOSE_LABEL[value] }}
        </option>
      </select>
      <select v-model="status" aria-label="Status" :class="selectClass">
        <option value="">Todos os status</option>
        <option v-for="value in MESSAGE_STATUS" :key="value" :value="value">
          {{ STATUS_LABEL[value] }}
        </option>
      </select>
    </div>

    <template v-if="messagesQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="messagesQuery.refetch()" />
    </template>

    <template v-else-if="messagesQuery.isLoading.value">
      <LoadingRows />
    </template>

    <template v-else-if="messages.length === 0">
      <EmptyState
        :icon="Mail"
        title="Nenhuma mensagem"
        :description="
          filtered
            ? 'Nenhuma mensagem corresponde ao filtro atual.'
            : 'As mensagens aparecem aqui quando uma competência é aberta.'
        "
      />
    </template>

    <template v-else>
      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader class="bg-sunken/60">
              <TableRow class="hover:bg-transparent border-border">
                <TableHead class="font-semibold text-foreground">Data</TableHead>
                <TableHead class="font-semibold text-foreground">Empresa</TableHead>
                <TableHead class="font-semibold text-foreground">Tipo</TableHead>
                <TableHead class="font-semibold text-foreground">Canal</TableHead>
                <TableHead class="font-semibold text-foreground">Destinatário</TableHead>
                <TableHead class="font-semibold text-foreground">Status</TableHead>
                <TableHead class="text-right font-semibold text-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in messages" :key="row.id" class="border-border align-top">
                <TableCell class="text-muted-foreground text-xs tabular-nums whitespace-nowrap">
                  {{ dateTimeBr(row.createdAt) }}
                </TableCell>
                <TableCell>
                  <RouterLink
                    :to="`/solicitacoes/${row.requestId}`"
                    class="text-foreground hover:text-primary text-sm font-medium hover:underline"
                  >
                    {{ row.companyName }}
                  </RouterLink>
                </TableCell>
                <TableCell class="text-sm">{{ PURPOSE_LABEL[row.purpose] }}</TableCell>
                <TableCell class="text-sm">{{ CHANNEL_LABEL[row.channel] }}</TableCell>
                <TableCell class="text-muted-foreground text-xs">{{ row.recipient }}</TableCell>
                <TableCell>
                  <StatusPill :status="row.status" />
                  <p
                    v-if="row.error"
                    class="text-danger mt-1 max-w-xs text-xs break-words whitespace-normal"
                  >
                    {{ row.error }}
                  </p>
                </TableCell>
                <TableCell class="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    :disabled="resendingId === row.id"
                    @click="resend(row)"
                  >
                    <RotateCcw class="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    {{ resendingId === row.id ? 'Reenviando…' : 'Reenviar mensagem' }}
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <Pagination
        v-if="total > perPage"
        v-slot="{ page: current }"
        v-model:page="page"
        :total="total"
        :items-per-page="perPage"
        :sibling-count="1"
        show-edges
        class="mt-4"
      >
        <PaginationContent v-slot="{ items }">
          <PaginationPrevious />
          <template v-for="(item, index) in items" :key="index">
            <PaginationItem
              v-if="item.type === 'page'"
              :value="item.value"
              :is-active="item.value === current"
            >
              {{ item.value }}
            </PaginationItem>
            <PaginationEllipsis v-else :index="index" />
          </template>
          <PaginationNext />
        </PaginationContent>
      </Pagination>
    </template>
  </section>
</template>
