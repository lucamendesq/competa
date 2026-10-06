<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { toTypedSchema } from '@vee-validate/zod';
import { useForm, useField } from 'vee-validate';
import * as z from 'zod';
import { CreateCompanyBody, email as emailSchema } from '@competa/contracts';
import {} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/PageHeader.vue';
import Callout from '@/components/Callout.vue';
import {
  useCompanyChecklistFeature,
  useCompanyDetailFeature,
} from '@/features/companies/composables/useCompaniesFeature';
import {
  useChecklistsFeature,
  useTemplateDetailFeature,
} from '@/features/checklists/composables/useChecklistsFeature';
import { useSettingsStore } from '@/stores/settings';
import { toast } from 'vue-sonner';
import { apiErrorMessage, apiFieldErrors } from '@/api/error';

const props = defineProps<{ id?: string }>();
const router = useRouter();

const {
  detailQuery,
  createCompanyMutation,
  updateCompanyMutation,
  addContactMutation,
  updateContactMutation,
  removeContactMutation,
} = useCompanyDetailFeature(computed(() => props.id));
const { templatesQuery } = useChecklistsFeature();
const settingsStore = useSettingsStore();
const teamAccountants = computed(() => settingsStore.accountants);

const CATEGORY_LABEL: Record<string, string> = {
  fiscal: 'Fiscal / Impostos',
  accounting: 'Contábil / Financeiro',
  payroll: 'Folha de Pagamento',
  legal: 'Societário / Legal',
};

const PERIODICITY_LABEL: Record<string, string> = {
  monthly: 'Mensal',
  annual: 'Anual',
  on_demand: 'Sob demanda',
};

const COMPANY_FLAGS = ['has_employees', 'is_simples_nacional', 'is_lucro_presumido'] as const;
type CompanyFlags = Record<(typeof COMPANY_FLAGS)[number], boolean>;

const FLAG_LABEL: Record<string, string> = {
  has_employees: 'Possui funcionários',
  is_simples_nacional: 'Simples Nacional',
  is_lucro_presumido: 'Lucro Presumido',
};

const availableFlags = COMPANY_FLAGS.map((flag) => ({
  key: flag,
  label: FLAG_LABEL[flag],
}));

const CnpjSchema = z.string().refine(
  (val) => {
    const raw = val.replace(/\D/g, '');
    return raw.length === 14;
  },
  { message: 'CNPJ incompleto.' },
);

const CompanyForm = z
  .object({
    name: CreateCompanyBody.shape.name,
    checklistTemplateId: z.union([z.string().uuid(), z.literal('')]),
    responsibleAccountantId: z.union([z.string().uuid(), z.literal('')]),
    cnpj: z.union([CnpjSchema, z.literal('')]),
    contactName: z.string().trim(),
    contactEmail: z.union([emailSchema(), z.literal('')]),
    contactPhone: z.string().trim(),
  })
  .refine((value) => !value.contactName || value.contactEmail !== '', {
    message: 'Sem e-mail o Responsável não recebe o link de cobrança.',
    path: ['contactEmail'],
  });

const { handleSubmit, setValues, errors, setErrors } = useForm({
  validationSchema: toTypedSchema(CompanyForm),
  initialValues: {
    name: '',
    checklistTemplateId: '',
    responsibleAccountantId: '',
    cnpj: '',
    contactName: '',
    contactEmail: '',
    contactPhone: '',
  },
});

const { value: name } = useField<string>('name');
const { value: checklistTemplateId } = useField<string>('checklistTemplateId');
const { value: responsibleAccountantId } = useField<string>('responsibleAccountantId');
const { value: cnpj } = useField<string>('cnpj');
const { value: contactName } = useField<string>('contactName');
const { value: contactEmail } = useField<string>('contactEmail');
const { value: contactPhone } = useField<string>('contactPhone');

function cnpjInputMask(value: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function phoneInputMask(value: string | null) {
  if (!value) return '';
  const digits = value.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 10) {
    return digits.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
  }
  return digits.replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
}

watch(cnpj, (newVal) => {
  const masked = cnpjInputMask(newVal);
  if (masked !== newVal) cnpj.value = masked;
});

watch(contactPhone, (newVal) => {
  const masked = phoneInputMask(newVal);
  if (masked !== newVal) contactPhone.value = masked;
});

const flags = ref<CompanyFlags>({
  has_employees: false,
  is_simples_nacional: false,
  is_lucro_presumido: false,
});

watch(
  () => detailQuery.data.value,
  (loaded) => {
    if (loaded) {
      const contact = loaded.contacts[0];
      setValues({
        name: loaded.name ?? '',
        checklistTemplateId: loaded.checklistTemplateId ?? '',
        responsibleAccountantId: loaded.responsibleAccountantId ?? '',
        cnpj: loaded.cnpj ?? '',
        contactName: contact?.name ?? '',
        contactEmail: contact?.email ?? '',
        contactPhone: contact?.phone ?? '',
      });
      flags.value = {
        has_employees: !!((loaded.flags as any) || {}).has_employees,
        is_simples_nacional: !!((loaded.flags as any) || {}).is_simples_nacional,
        is_lucro_presumido: !!((loaded.flags as any) || {}).is_lucro_presumido,
      };
    }
  },
  { immediate: true },
);

const editing = computed(() => props.id !== undefined);

const { detailQuery: templateDetailQuery } = useTemplateDetailFeature(checklistTemplateId);
const { effectiveChecklistQuery } = useCompanyChecklistFeature(computed(() => props.id));

/* O checklist efetivo (template + overrides da Empresa) só descreve o que está salvo.
 * Trocar o template no formulário sem salvar invalida os overrides, então aí a prévia
 * volta a ser o template cru. */
const previewFromOverrides = computed(
  () =>
    Boolean(props.id) &&
    checklistTemplateId.value === (detailQuery.data.value?.checklistTemplateId ?? ''),
);

type PreviewLine = {
  key: string;
  name: string;
  category: string;
  periodicity: string;
  conditionFlag: string | null;
  fromOverride: boolean;
};

const previewSource = computed<PreviewLine[]>(() => {
  if (previewFromOverrides.value) {
    return (effectiveChecklistQuery.data.value?.items ?? []).map((item) => ({
      key: item.documentTypeId,
      name: item.name,
      category: item.category,
      periodicity: item.periodicity,
      conditionFlag: item.conditionFlag,
      fromOverride: item.source === 'override',
    }));
  }

  return (templateDetailQuery.data.value?.items ?? []).map((item) => ({
    key: item.id,
    name: item.name,
    category: item.category,
    periodicity: item.periodicity,
    conditionFlag: item.conditionFlag,
    fromOverride: false,
  }));
});

const previewLoading = computed(() =>
  previewFromOverrides.value
    ? effectiveChecklistQuery.isLoading.value
    : templateDetailQuery.isLoading.value,
);

const preview = computed(() => {
  const items = previewSource.value.filter(
    (item) => item.conditionFlag === null || (flags.value as any)[item.conditionFlag] === true,
  );

  const byCategory = new Map<string, PreviewLine[]>();
  for (const item of items) {
    byCategory.set(item.category, [...(byCategory.get(item.category) ?? []), item]);
  }

  return {
    total: items.length,
    groups: Array.from(byCategory.entries()),
    customized: items.some((item) => item.fromOverride),
  };
});

const error = ref<string | null>(null);
const saving = ref(false);

const SERVER_FIELD_ALIAS: Record<string, string> = {
  'contact.name': 'contactName',
  'contact.email': 'contactEmail',
  'contact.phone': 'contactPhone',
};

const toFormFields = (fieldErrors: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(fieldErrors).map(([path, message]) => [
      SERVER_FIELD_ALIAS[path] ?? path,
      message,
    ]),
  );

async function syncContact(contact?: { name: string; email: string; phone?: string }) {
  const existing = detailQuery.data.value?.contacts[0];
  if (contact && !existing) {
    await addContactMutation.mutateAsync(contact);
    return;
  }
  if (contact && existing) {
    await updateContactMutation.mutateAsync({ contactId: existing.id, body: contact });
    return;
  }
  if (!contact && existing) {
    await removeContactMutation.mutateAsync(existing.id);
  }
}

const onSubmit = handleSubmit(async (values) => {
  if (saving.value) return;
  saving.value = true;
  error.value = null;
  const contact = values.contactEmail
    ? {
        name: values.contactName || values.name,
        email: values.contactEmail,
        phone: values.contactPhone || undefined,
      }
    : undefined;

  try {
    if (editing.value) {
      await updateCompanyMutation.mutateAsync({
        name: values.name,
        checklistTemplateId: values.checklistTemplateId || null,
        responsibleAccountantId: values.responsibleAccountantId || null,
        cnpj: values.cnpj || null,
        flags: flags.value,
      });
      await syncContact(contact);
      toast.success('Empresa atualizada.');
      router.push('/empresas');
    } else {
      const created = await createCompanyMutation.mutateAsync({
        name: values.name,
        checklistTemplateId: values.checklistTemplateId || undefined,
        responsibleAccountantId: values.responsibleAccountantId || undefined,
        cnpj: values.cnpj || undefined,
        flags: flags.value,
        contact,
      });
      toast.success('Empresa cadastrada.');
      if (values.checklistTemplateId) {
        router.push({ path: `/empresas/${created.id}/checklist`, query: { created: '1' } });
      } else {
        router.push('/empresas');
      }
    }
  } catch (err) {
    error.value = apiErrorMessage(err, 'Não foi possível salvar a empresa.');
    setErrors(toFormFields(apiFieldErrors(err)));
  } finally {
    saving.value = false;
  }
});
</script>

<template>
  <PageHeader :title="editing ? 'Editar empresa' : 'Nova empresa'" />

  <form
    class="mx-auto mt-8 flex max-w-4xl flex-col items-start gap-12 lg:flex-row"
    @submit="onSubmit"
  >
    <div class="flex flex-1 flex-col gap-10">
      <Callout v-if="error" tone="danger" :heading="error" />

      <section class="flex flex-col gap-6">
        <div>
          <h2 class="text-base font-semibold leading-7">Dados da empresa</h2>
          <p class="text-muted-foreground mt-1 text-sm leading-6">
            O nome aparece no link de upload e nos emails enviados para o cliente.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="name">Nome da empresa <span class="text-danger">*</span></Label>
            <Input id="name" v-model="name" />
            <p v-if="errors.name" class="text-danger text-sm">{{ errors.name }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="cnpj">CNPJ (Opcional)</Label>
            <Input id="cnpj" v-model="cnpj" placeholder="00.000.000/0000-00" />
            <p v-if="errors.cnpj" class="text-danger text-sm">{{ errors.cnpj }}</p>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-6">
        <div>
          <h2 class="text-base font-semibold leading-7">Responsável pelo envio</h2>
          <p class="text-muted-foreground mt-1 text-sm leading-6">
            Quem recebe os links de cobrança desta empresa.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="contactName">Nome do contato</Label>
            <Input id="contactName" v-model="contactName" placeholder="Ex: João da Silva" />
            <p v-if="errors.contactName" class="text-danger text-sm">{{ errors.contactName }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="contactEmail">E-mail</Label>
            <Input id="contactEmail" type="email" v-model="contactEmail" />
            <p v-if="errors.contactEmail" class="text-danger text-sm">{{ errors.contactEmail }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="contactPhone">WhatsApp (Opcional)</Label>
            <Input
              id="contactPhone"
              type="tel"
              v-model="contactPhone"
              placeholder="(00) 00000-0000"
            />
            <p v-if="errors.contactPhone" class="text-danger text-sm">{{ errors.contactPhone }}</p>
          </div>
        </div>
      </section>

      <section class="flex flex-col gap-6">
        <div>
          <h2 class="text-base font-semibold leading-7">Atendimento</h2>
          <p class="text-muted-foreground mt-1 text-sm leading-6">
            Responsável interno e obrigações da empresa.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="responsibleAccountantId">Contador responsável</Label>
            <select
              id="responsibleAccountantId"
              v-model="responsibleAccountantId"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">Nenhum (qualquer um da equipe pode atender)</option>
              <option v-for="user in teamAccountants" :key="user.id" :value="user.id">
                {{ user.name }}
              </option>
            </select>
            <p v-if="errors.responsibleAccountantId" class="text-danger text-sm">
              {{ errors.responsibleAccountantId }}
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-4 mt-2">
          <div v-for="flag in availableFlags" :key="flag.key" class="flex items-center gap-2">
            <input
              type="checkbox"
              :id="'flag-' + flag.key"
              v-model="flags[flag.key]"
              class="size-4"
            />
            <Label :for="'flag-' + flag.key" class="font-normal">{{ flag.label }}</Label>
          </div>
        </div>
      </section>

      <div class="border-border flex gap-3 border-t pt-6">
        <Button variant="ghost" type="button" @click="router.back()">Cancelar</Button>
        <Button type="submit" :disabled="saving">
          {{ saving ? 'Salvando...' : 'Salvar empresa' }}
        </Button>
      </div>
    </div>

    <div
      class="bg-card border-border flex w-full flex-col gap-6 rounded-xl border p-4 shadow-sm lg:sticky lg:top-8 lg:w-[24rem]"
    >
      <div>
        <Label for="checklistTemplateId" class="mb-2 block">Checklist aplicado</Label>
        <select
          id="checklistTemplateId"
          v-model="checklistTemplateId"
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Sem template de checklist</option>
          <option v-for="t in templatesQuery.data.value" :key="t.id" :value="t.id">
            {{ t.name }}
          </option>
        </select>
        <p class="text-muted-foreground mt-2 text-xs">
          Empresas sem template não entram no disparo em lote ao abrir uma competência.
        </p>
      </div>

      <div
        v-if="(checklistTemplateId || preview.total > 0) && !previewLoading"
        class="border-border border-t pt-6"
      >
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold">
            Prévia do checklist
            <span v-if="preview.customized" class="text-muted-foreground font-normal">
              — inclui ajustes desta empresa
            </span>
          </h3>
          <span
            class="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
          >
            {{ preview.total }} itens
          </span>
        </div>

        <div class="mt-4 flex flex-col gap-6">
          <div
            v-for="[category, items] in preview.groups"
            :key="category"
            class="flex flex-col gap-2"
          >
            <h4 class="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {{ CATEGORY_LABEL[category] ?? category }}
            </h4>
            <ul class="flex flex-col gap-3">
              <li v-for="item in items" :key="item.key" class="text-sm flex flex-col">
                <span class="font-medium text-foreground">
                  {{ item.name }}
                  <span v-if="item.fromOverride" class="text-info-foreground ml-1 text-xs">
                    (ajuste)
                  </span>
                </span>
                <span class="text-muted-foreground mt-0.5 text-xs">
                  {{ PERIODICITY_LABEL[item.periodicity] ?? item.periodicity }}
                  <span v-if="item.conditionFlag" class="text-warning-foreground ml-2 font-medium">
                    (Se {{ FLAG_LABEL[item.conditionFlag] }})
                  </span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </form>
</template>
