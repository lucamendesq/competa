<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Mail,
  MailX,
  Check,
  CircleCheck,
  Pencil,
  SquareCheckBig,
  Send,
  Building2,
  Upload,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import PageHeader from '@/components/PageHeader.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import Modal from '@/components/Modal.vue';
import Pagination from '@/components/ui/pagination/Pagination.vue';
import StatusPill from '@/components/StatusPill.vue';
import EmptyState from '@/components/ui/empty/EmptyState.vue';
import PlanCapBanner from '@/components/PlanCapBanner.vue';
import { useCompaniesFeature } from '@/features/companies/composables/useCompaniesFeature';
import { usePlanUsage } from '@/features/companies/composables/usePlanUsage';
import { useQueryClient } from '@tanstack/vue-query';
import { useChecklistsFeature } from '@/features/checklists/composables/useChecklistsFeature';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';

const page = ref(1);
const perPage = ref(20);
const active = ref<string | undefined>(undefined);
const search = ref('');

const debouncedSearch = ref('');
let timer: ReturnType<typeof setTimeout>;
watch(search, (val) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    debouncedSearch.value = val;
  }, 300);
});

const queryClient = useQueryClient();
const { data: usage } = usePlanUsage();

/* Invalida o prefixo, não só a lista: o consumo do teto (e o banner de excedente) vive sob
 * a mesma chave e tem que apagar junto quando a Empresa é desativada. */
const refreshCompanies = () => queryClient.invalidateQueries({ queryKey: ['companies'] });

/** Com a carteira inteira importada, dezenas de linhas inativas afogam a lista: a contagem
 *  no chip é o que torna o recorte ativa/inativa legível antes de clicar. */
const statusChips = computed(() => [
  {
    value: undefined,
    label: 'Todas',
    count: usage.value ? usage.value.companiesActive + usage.value.companiesInactive : undefined,
  },
  { value: 'true', label: 'Ativas', count: usage.value?.companiesActive },
  { value: 'false', label: 'Inativas', count: usage.value?.companiesInactive },
]);

const { companiesQuery, sendAccessInvitesMutation, applyTemplateMutation } = useCompaniesFeature(
  page,
  perPage,
  active,
  debouncedSearch,
);
const { templatesQuery } = useChecklistsFeature();

const companies = computed(() => companiesQuery.data.value?.data ?? []);
const meta = computed(() => companiesQuery.data.value?.meta ?? { total: 0, page: 1, perPage: 20 });

function maskedCnpj(cnpj: string | null) {
  if (!cnpj) return '—';
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

const confirmDeactivate = ref<any | null>(null);
const acting = ref(false);

async function deactivate(company: any) {
  acting.value = true;
  // Temporarily grab a mutated action logic using our detail composable helper without mounting it
  const { deactivateCompany } = await import('@/features/companies/api/companies');
  try {
    await deactivateCompany(company.id);
    await refreshCompanies();
    toast.success('Empresa desativada.');
    confirmDeactivate.value = null;
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível desativar.'));
  } finally {
    acting.value = false;
  }
}

async function reactivate(company: any) {
  acting.value = true;
  const { updateCompany } = await import('@/features/companies/api/companies');
  try {
    await updateCompany(company.id, { active: true });
    await refreshCompanies();
    toast.success('Empresa reativada.');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível reativar.'));
  } finally {
    acting.value = false;
  }
}

const inviting = ref<string | null>(null);

/* Sessão, não servidor: o reenvio é legítimo amanhã, o que não pode é a mesma tela
 * virar botão de spam enquanto o Contador olha para ela. */
const INVITED_KEY = 'competa_invited_companies';

const readInvited = (): string[] => {
  try {
    const raw = sessionStorage.getItem(INVITED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

const invited = ref<Set<string>>(new Set(readInvited()));

function markInvited(id: string) {
  const next = new Set(invited.value);
  next.add(id);
  invited.value = next;
  try {
    sessionStorage.setItem(INVITED_KEY, JSON.stringify([...next]));
  } catch {
    return;
  }
}

async function inviteToApp(company: any) {
  inviting.value = company.id;
  try {
    const res = await sendAccessInvitesMutation.mutateAsync([company.id]);
    /* Só marca como convidada a Empresa que de fato recebeu e-mail, e o aviso diz o
     * motivo que a API deu para cada contato pulado — "já possuem acesso" era dito até
     * para Empresa sem Responsável. */
    if (res.invited > 0) {
      markInvited(company.id);
      toast.success(
        res.invited === 1 ? 'Convite enviado por e-mail.' : `${res.invited} convites enviados.`,
      );
    }
    const reasons = [
      ...new Set(
        res.results
          .filter((row) => row.status !== 'invited')
          .map((row) => (row.email ? `${row.email}: ${row.reason}` : row.reason))
          .filter(Boolean),
      ),
    ];
    if (reasons.length) toast.info(reasons.join(' '));
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível enviar o convite.'));
  } finally {
    inviting.value = null;
  }
}

// Bulk selection
const selectedIds = ref<Set<string>>(new Set());

function toggleSelected(id: string) {
  const newSet = new Set(selectedIds.value);
  if (newSet.has(id)) newSet.delete(id);
  else newSet.add(id);
  selectedIds.value = newSet;
}

function selectAll() {
  if (selectedIds.value.size === companies.value.length) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(companies.value.map((c) => c.id));
  }
}

function clearSelection() {
  selectedIds.value = new Set();
}

const activating = ref(false);

async function activateSelected() {
  activating.value = true;
  try {
    const { activateCompanies } = await import('@/features/companies/api/companies');
    const result = await activateCompanies(Array.from(selectedIds.value));

    if (result.activated) toast.success(`${result.activated} empresa(s) ativada(s).`);
    if (result.reason) toast.warning(result.reason);
    if (!result.activated && !result.reason) toast.info('Nenhuma empresa inativa na seleção.');

    clearSelection();
    await refreshCompanies();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível ativar as empresas.'));
  } finally {
    activating.value = false;
  }
}

const bulkTemplateId = ref('');
const applyingTemplate = ref(false);

async function applyTemplateToSelected() {
  if (!bulkTemplateId.value || selectedIds.value.size === 0) return;
  applyingTemplate.value = true;
  try {
    await applyTemplateMutation.mutateAsync({
      companyIds: Array.from(selectedIds.value),
      checklistTemplateId: bulkTemplateId.value,
    });
    toast.success(`Template aplicado a ${selectedIds.value.size} empresa(s).`);
    clearSelection();
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível aplicar template.'));
  } finally {
    applyingTemplate.value = false;
  }
}
</script>

<template>
  <PageHeader
    title="Empresas"
    description="Carteira de clientes ativos e inativos da contabilidade."
  >
    <Button variant="outline" class="mr-2 shadow-xs" as-child>
      <RouterLink to="/empresas/importar">
        <Upload class="mr-2 h-4 w-4" /> Importar CSV
      </RouterLink>
    </Button>
    <Button as-child class="shadow-xs font-medium">
      <RouterLink to="/empresas/nova"> <Building2 class="mr-2 h-4 w-4" /> Nova empresa </RouterLink>
    </Button>
  </PageHeader>

  <PlanCapBanner class="mt-6" />

  <section class="mt-8">
    <div class="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div class="relative w-full sm:w-80">
        <Input
          v-model="search"
          type="search"
          placeholder="Buscar pelo nome ou CNPJ"
          class="w-full shadow-xs focus-visible:ring-ring focus-visible:border-primary"
          aria-label="Buscar empresa"
        />
      </div>
      <div
        class="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0"
        role="group"
        aria-label="Status da empresa"
      >
        <button
          v-for="chip in statusChips"
          :key="String(chip.value)"
          type="button"
          class="shrink-0 rounded-full border px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :class="
            active === chip.value
              ? 'bg-primary/10 text-primary border-primary/30 font-semibold shadow-xs'
              : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'
          "
          @click="active = chip.value"
        >
          {{ chip.label
          }}<span v-if="chip.count !== undefined" class="ml-1.5 tabular-nums opacity-70">{{
            chip.count
          }}</span>
        </button>
      </div>
    </div>

    <template v-if="companiesQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="companiesQuery.refetch()" />
    </template>

    <template v-else-if="companiesQuery.isLoading.value">
      <LoadingRows />
    </template>

    <template v-else-if="companies.length === 0">
      <EmptyState
        :icon="Building2"
        title="Nenhuma empresa"
        :description="
          search || active
            ? 'Nenhuma empresa corresponde ao filtro atual.'
            : 'Cadastre a primeira empresa (ou importe um CSV) para começar a cobrar documentos.'
        "
        :action-label="search || active ? undefined : 'Nova empresa'"
        @action="$router.push('/empresas/nova')"
      />
    </template>

    <template v-else>
      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader class="bg-sunken/60">
              <TableRow class="hover:bg-transparent border-border">
                <TableHead class="w-12 font-semibold text-foreground">
                  <input
                    type="checkbox"
                    class="size-4 rounded border-border text-primary focus:ring-ring accent-primary"
                    aria-label="Selecionar todas"
                    :checked="companies.length > 0 && selectedIds.size === companies.length"
                    @change="selectAll"
                  />
                </TableHead>
                <TableHead class="font-semibold text-foreground">Nome</TableHead>
                <TableHead class="font-semibold text-foreground">CNPJ</TableHead>
                <TableHead class="font-semibold text-foreground">Responsável</TableHead>
                <TableHead class="font-semibold text-foreground">Template</TableHead>
                <TableHead class="font-semibold text-foreground">Status</TableHead>
                <TableHead class="text-right font-semibold text-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="company in companies"
                :key="company.id"
                class="border-border hover:bg-slate-50/75 transition-colors"
              >
                <TableCell>
                  <input
                    type="checkbox"
                    class="size-4 rounded border-border text-primary focus:ring-ring accent-primary"
                    :aria-label="'Selecionar ' + company.name"
                    :checked="selectedIds.has(company.id)"
                    @change="toggleSelected(company.id)"
                  />
                </TableCell>
                <TableCell class="font-medium font-display text-foreground">
                  <RouterLink
                    :to="`/empresas/${company.id}/editar`"
                    class="hover:text-primary transition-colors hover:underline"
                  >
                    {{ company.name }}
                  </RouterLink>
                </TableCell>
                <TableCell class="tabular-nums text-muted-foreground text-xs sm:text-sm">
                  {{ maskedCnpj(company.cnpj) }}
                </TableCell>
                <TableCell>
                  <template v-if="!company.contactCount || !company.contacts.length">
                    <span
                      class="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2.5 py-0.5 text-[11px] font-semibold text-danger"
                    >
                      <MailX class="h-3 w-3" aria-hidden="true" /> Sem Responsável
                    </span>
                  </template>
                  <template v-else>
                    <div class="flex flex-col gap-0.5">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium text-foreground">{{
                          company.contacts[0].name
                        }}</span>
                        <template v-if="!company.readyContactCount">
                          <span
                            class="text-muted-foreground border-border bg-muted/60 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                            title="O Responsável envia pelo link, sem conta. A conta é opcional."
                          >
                            <Mail class="h-2.5 w-2.5" aria-hidden="true" /> Link
                          </span>
                        </template>
                        <template v-else>
                          <span
                            class="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-surface px-1.5 py-0.5 text-[10px] font-semibold text-success"
                          >
                            <CircleCheck class="h-2.5 w-2.5" aria-hidden="true" /> App
                          </span>
                        </template>
                      </div>
                      <span class="text-muted-foreground text-xs">{{
                        company.contacts[0].email
                      }}</span>
                      <span
                        v-if="company.contacts.length > 1"
                        class="text-muted-foreground text-[10px]"
                      >
                        +{{ company.contacts.length - 1 }} outro(s)
                      </span>
                    </div>
                  </template>
                </TableCell>
                <TableCell>
                  <template v-if="company.templateName">
                    <RouterLink
                      :to="`/empresas/${company.id}/checklist`"
                      class="text-foreground hover:text-primary transition-colors hover:underline text-sm font-medium"
                    >
                      {{ company.templateName }}
                    </RouterLink>
                  </template>
                  <template v-else>
                    <span
                      class="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-surface px-2.5 py-0.5 text-[11px] font-semibold text-warning-foreground"
                    >
                      Sem template
                    </span>
                  </template>
                </TableCell>
                <TableCell>
                  <StatusPill :status="company.active ? 'active' : 'inactive'" />
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex flex-wrap items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      as-child
                      class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RouterLink :to="`/empresas/${company.id}/editar`">
                        <Pencil class="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Editar
                      </RouterLink>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      as-child
                      class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RouterLink :to="`/empresas/${company.id}/checklist`">
                        <SquareCheckBig class="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Checklist
                      </RouterLink>
                    </Button>
                    <Button
                      v-if="company.contactCount && !company.readyContactCount"
                      variant="ghost"
                      size="sm"
                      class="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                      :disabled="inviting === company.id || invited.has(company.id)"
                      @click="inviteToApp(company)"
                    >
                      <Check
                        v-if="invited.has(company.id)"
                        class="mr-1.5 h-3.5 w-3.5 text-success"
                        aria-hidden="true"
                      />
                      <Send v-else class="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      <template v-if="invited.has(company.id)">Convite enviado</template>
                      <template v-else>{{
                        inviting === company.id ? 'Convidando…' : 'Convidar para o app'
                      }}</template>
                    </Button>
                    <Button
                      v-if="company.active"
                      variant="ghost"
                      size="sm"
                      class="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                      @click="confirmDeactivate = company"
                    >
                      Desativar
                    </Button>
                    <Button
                      v-else
                      variant="ghost"
                      size="sm"
                      class="h-8 px-2 text-xs text-muted-foreground hover:text-primary"
                      :disabled="acting"
                      @click="reactivate(company)"
                    >
                      Reativar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>

        <Pagination v-model:page="page" :total="meta.total" :items-per-page="perPage" />
      </div>
    </template>
  </section>

  <Modal
    :open="confirmDeactivate !== null"
    @update:open="$event ? null : (confirmDeactivate = null)"
    title="Desativar empresa?"
    description="Empresa desativada não entra no fan-out das próximas competências."
  >
    <p class="text-sm text-foreground">
      {{ confirmDeactivate?.name }} deixa de ser cobrada. As solicitações já abertas continuam como
      estão, e você pode reativá-la depois.
    </p>

    <div
      class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
    >
      <Button variant="ghost" @click="confirmDeactivate = null">Cancelar</Button>
      <Button variant="destructive" :disabled="acting" @click="deactivate(confirmDeactivate!)">
        Desativar
      </Button>
    </div>
  </Modal>

  <div v-if="selectedIds.size" class="h-20" aria-hidden="true"></div>
  <div
    v-if="selectedIds.size"
    class="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-3.5 shadow-[0_-4px_16px_rgba(15,23,42,0.08)]"
    role="region"
    aria-label="Ações em lote nas empresas selecionadas"
  >
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
      <p class="mr-auto text-sm text-foreground font-medium">
        <b class="font-semibold text-primary tabular-nums">{{ selectedIds.size }}</b>
        {{ selectedIds.size === 1 ? 'empresa selecionada' : 'empresas selecionadas' }}
      </p>
      <select
        v-model="bulkTemplateId"
        class="flex h-10 w-56 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Template de checklist"
      >
        <option value="">Escolha um template</option>
        <option
          v-for="template in templatesQuery.data.value"
          :key="template.id"
          :value="template.id"
        >
          {{ template.name }}
        </option>
      </select>
      <Button
        variant="outline"
        class="shadow-xs font-medium"
        :disabled="activating || applyingTemplate"
        @click="activateSelected"
      >
        {{ activating ? 'Ativando…' : 'Ativar selecionadas' }}
      </Button>
      <Button variant="ghost" :disabled="applyingTemplate || activating" @click="clearSelection">
        Limpar seleção
      </Button>
      <Button
        :disabled="applyingTemplate || !bulkTemplateId"
        class="shadow-xs font-medium"
        @click="applyTemplateToSelected"
      >
        {{
          applyingTemplate
            ? 'Aplicando…'
            : 'Aplicar a ' + selectedIds.size + (selectedIds.size === 1 ? ' empresa' : ' empresas')
        }}
      </Button>
    </div>
  </div>
</template>
