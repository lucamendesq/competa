<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  Mail,
  MailX,
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
import { useCompaniesFeature } from '@/features/companies/composables/useCompaniesFeature';
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
    companiesQuery.refetch();
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
    companiesQuery.refetch();
    toast.success('Empresa reativada.');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível reativar.'));
  } finally {
    acting.value = false;
  }
}

const inviting = ref<string | null>(null);
async function inviteToApp(company: any) {
  inviting.value = company.id;
  try {
    const res = await sendAccessInvitesMutation.mutateAsync([company.id]);
    if (res.skipped > 0) {
      toast.info('Nenhum e-mail enviado (contatos já possuem acesso).');
    } else {
      toast.success('Convite enviado por e-mail.');
    }
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
    <Button variant="outline" class="mr-2" as-child>
      <RouterLink to="/empresas/importar">
        <Upload class="mr-2 h-4 w-4" /> Importar CSV
      </RouterLink>
    </Button>
    <Button as-child>
      <RouterLink to="/empresas/nova"> <Building2 class="mr-2 h-4 w-4" /> Nova empresa </RouterLink>
    </Button>
  </PageHeader>

  <section class="mt-8">
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <Input
        v-model="search"
        type="search"
        placeholder="Buscar pelo nome ou CNPJ"
        class="w-full sm:w-80"
        aria-label="Buscar empresa"
      />
      <select
        v-model="active"
        class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-48"
        aria-label="Status da empresa"
      >
        <option :value="undefined">Todas (Ativas e Inativas)</option>
        <option value="true">Apenas Ativas</option>
        <option value="false">Apenas Inativas</option>
      </select>
    </div>

    <template v-if="companiesQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="companiesQuery.refetch()" />
    </template>

    <template v-else-if="companiesQuery.isLoading.value">
      <LoadingRows />
    </template>

    <template v-else>
      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead class="w-12">
                  <input
                    type="checkbox"
                    class="size-4"
                    aria-label="Selecionar todas"
                    :checked="companies.length > 0 && selectedIds.size === companies.length"
                    @change="selectAll"
                  />
                </TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Template</TableHead>
                <TableHead>Status</TableHead>
                <TableHead class="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="company in companies" :key="company.id">
                <TableCell>
                  <input
                    type="checkbox"
                    class="size-4"
                    :aria-label="'Selecionar ' + company.name"
                    :checked="selectedIds.has(company.id)"
                    @change="toggleSelected(company.id)"
                  />
                </TableCell>
                <TableCell class="font-medium">
                  <RouterLink :to="`/empresas/${company.id}/editar`" class="hover:underline">
                    {{ company.name }}
                  </RouterLink>
                </TableCell>
                <TableCell class="tabular-nums text-muted-foreground">{{
                  maskedCnpj(company.cnpj)
                }}</TableCell>
                <TableCell>
                  <template v-if="!company.contactCount || !company.contacts.length">
                    <span
                      class="inline-flex items-center gap-1 rounded-full border border-danger-border bg-danger-surface px-2 py-0.5 text-[11px] font-semibold text-danger"
                    >
                      <MailX class="h-3 w-3" aria-hidden="true" /> Sem Responsável
                    </span>
                  </template>
                  <template v-else>
                    <div class="flex flex-col gap-0.5">
                      <div class="flex items-center gap-1.5">
                        <span class="text-xs font-medium">{{ company.contacts[0].name }}</span>
                        <template v-if="!company.readyContactCount">
                          <span
                            class="text-muted-foreground border-border inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                            title="O Responsável envia pelo link, sem conta. A conta é opcional."
                          >
                            <Mail class="h-[10px] w-[10px]" aria-hidden="true" /> Link
                          </span>
                        </template>
                        <template v-else>
                          <span
                            class="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-surface px-1.5 py-0.5 text-[10px] font-semibold text-success"
                          >
                            <CircleCheck class="h-[10px] w-[10px]" aria-hidden="true" /> App
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
                    <RouterLink :to="`/empresas/${company.id}/checklist`" class="hover:underline">
                      {{ company.templateName }}
                    </RouterLink>
                  </template>
                  <template v-else>
                    <span
                      class="inline-flex items-center gap-1 rounded-full border border-warning-border bg-warning-surface px-2 py-0.5 text-[11px] font-semibold text-warning-foreground"
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
                    <Button variant="ghost" size="sm" as-child>
                      <RouterLink :to="`/empresas/${company.id}/editar`">
                        <Pencil class="mr-2 h-4 w-4" aria-hidden="true" /> Editar
                      </RouterLink>
                    </Button>
                    <Button variant="ghost" size="sm" as-child>
                      <RouterLink :to="`/empresas/${company.id}/checklist`">
                        <SquareCheckBig class="mr-2 h-4 w-4" aria-hidden="true" /> Checklist
                      </RouterLink>
                    </Button>
                    <Button
                      v-if="company.contactCount && !company.readyContactCount"
                      variant="ghost"
                      size="sm"
                      :disabled="inviting === company.id"
                      @click="inviteToApp(company)"
                    >
                      <Send class="mr-2 h-4 w-4" aria-hidden="true" />
                      {{ inviting === company.id ? 'Convidando…' : 'Convidar para o app' }}
                    </Button>
                    <Button
                      v-if="company.active"
                      variant="ghost"
                      size="sm"
                      @click="confirmDeactivate = company"
                    >
                      Desativar
                    </Button>
                    <Button
                      v-else
                      variant="ghost"
                      size="sm"
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
    <p class="text-sm">
      {{ confirmDeactivate?.name }} deixa de ser cobrada. As solicitações já abertas continuam como
      estão, e você pode reativá-la depois.
    </p>

    <div
      class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex flex-wrap justify-end gap-2 border-t p-4"
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
    class="border-border bg-card fixed inset-x-0 bottom-0 z-40 border-t p-3 shadow-[0_-4px_12px_rgba(15,23,42,0.08)]"
    role="region"
    aria-label="Aplicar template em lote"
  >
    <div class="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
      <p class="mr-auto text-sm">
        <b>{{ selectedIds.size }}</b>
        {{ selectedIds.size === 1 ? 'empresa selecionada' : 'empresas selecionadas' }}
      </p>
      <select
        v-model="bulkTemplateId"
        class="flex h-10 w-56 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
      <Button variant="ghost" :disabled="applyingTemplate" @click="clearSelection">
        Limpar seleção
      </Button>
      <Button :disabled="applyingTemplate || !bulkTemplateId" @click="applyTemplateToSelected">
        {{
          applyingTemplate
            ? 'Aplicando…'
            : 'Aplicar a ' + selectedIds.size + (selectedIds.size === 1 ? ' empresa' : ' empresas')
        }}
      </Button>
    </div>
  </div>
</template>
