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

/* `z.union` aqui (uuid/email/cnpj válido OU string vazia) gera, quando a validação falha,
 * um issue `invalid_union` cujo formato mudou do zod3 pro zod4 — o `@vee-validate/zod`
 * instalado (4.15.1, sem versão mais nova disponível) ainda lê o campo `unionErrors` do
 * zod3, que não existe mais, e quebra com "Cannot read properties of undefined (reading
 * 'flatMap')". Isso ia estourar sempre que o campo validasse vazio/incompleto, inclusive
 * numa validação perdida que o vee-validate dispara durante o unmount logo após o submit
 * (navegação já trocou de rota). Por isso os campos "opcional, mas se preenchido precisa
 * ser válido" abaixo usam `.refine()` sobre `z.string()` em vez de `z.union`: mesmo
 * comportamento, sem o issue `invalid_union` que a lib não sabe processar. `val`/`value`
 * podem chegar `undefined` nessa mesma validação perdida — daí o `?? ''`. */
const CnpjSchema = z.string().refine(
  (val) => {
    const raw = (val ?? '').replace(/\D/g, '');
    return raw === '' || raw.length === 14;
  },
  { message: 'CNPJ incompleto.' },
);

const optionalUuid = (message: string) =>
  z.string().refine((val) => (val ?? '') === '' || z.string().uuid().safeParse(val).success, {
    message,
  });

const optionalEmail = () =>
  z.string().refine((val) => (val ?? '') === '' || emailSchema().safeParse(val).success, {
    message: 'E-mail inválido.',
  });

const CompanyForm = z
  .object({
    name: CreateCompanyBody.shape.name,
    checklistTemplateId: optionalUuid('Checklist inválido.'),
    responsibleAccountantId: optionalUuid('Contador inválido.'),
    cnpj: CnpjSchema,
    contactName: z.string().trim(),
    contactEmail: optionalEmail(),
    contactPhone: z.string().trim(),
  })
  .refine((value) => !value?.contactName || value.contactEmail !== '', {
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

const formValid = computed(
  () =>
    CompanyForm.safeParse({
      name: name.value,
      checklistTemplateId: checklistTemplateId.value,
      responsibleAccountantId: responsibleAccountantId.value,
      cnpj: cnpj.value,
      contactName: contactName.value,
      contactEmail: contactEmail.value,
      contactPhone: contactPhone.value,
    }).success,
);

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
    novalidate
    class="mx-auto mt-8 flex max-w-5xl flex-col items-start gap-8 lg:flex-row"
    @submit="onSubmit"
  >
    <div class="flex flex-1 flex-col gap-6 w-full">
      <Callout v-if="error" tone="danger" :heading="error" />

      <section class="bg-card border-border shadow-sm rounded-xl p-6 border flex flex-col gap-6">
        <div class="border-b border-border/80 pb-4">
          <h2 class="font-display text-base font-semibold leading-7 text-foreground">
            Dados da empresa
          </h2>
          <p class="text-muted-foreground mt-1 text-sm leading-6">
            O nome aparece no link de upload e nos emails enviados para o cliente.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="name" class="font-medium text-foreground"
              >Nome da empresa <span class="text-danger">*</span></Label
            >
            <Input
              id="name"
              v-model="name"
              class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
            />
            <p v-if="errors.name" class="text-danger text-sm">{{ errors.name }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="cnpj" class="font-medium text-foreground">CNPJ (Opcional)</Label>
            <Input
              id="cnpj"
              v-model="cnpj"
              placeholder="00.000.000/0000-00"
              class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
            />
            <p v-if="errors.cnpj" class="text-danger text-sm">{{ errors.cnpj }}</p>
          </div>
        </div>
      </section>

      <section class="bg-card border-border shadow-sm rounded-xl p-6 border flex flex-col gap-6">
        <div class="border-b border-border/80 pb-4">
          <h2 class="font-display text-base font-semibold leading-7 text-foreground">
            Responsável pelo envio
          </h2>
          <p class="text-muted-foreground mt-1 text-sm leading-6">
            Quem recebe os links de cobrança desta empresa.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="contactName" class="font-medium text-foreground">Nome do contato</Label>
            <Input
              id="contactName"
              v-model="contactName"
              placeholder="Ex: João da Silva"
              class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
            />
            <p v-if="errors.contactName" class="text-danger text-sm">{{ errors.contactName }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="contactEmail" class="font-medium text-foreground">E-mail</Label>
            <Input
              id="contactEmail"
              type="email"
              v-model="contactEmail"
              class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
            />
            <p v-if="errors.contactEmail" class="text-danger text-sm">{{ errors.contactEmail }}</p>
          </div>

          <div class="flex flex-col gap-1.5">
            <Label for="contactPhone" class="font-medium text-foreground"
              >WhatsApp (Opcional)</Label
            >
            <Input
              id="contactPhone"
              type="tel"
              v-model="contactPhone"
              placeholder="(00) 00000-0000"
              class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
            />
            <p v-if="errors.contactPhone" class="text-danger text-sm">{{ errors.contactPhone }}</p>
          </div>
        </div>
      </section>

      <section class="bg-card border-border shadow-sm rounded-xl p-6 border flex flex-col gap-6">
        <div class="border-b border-border/80 pb-4">
          <h2 class="font-display text-base font-semibold leading-7 text-foreground">
            Atendimento
          </h2>
          <p class="text-muted-foreground mt-1 text-sm leading-6">
            Responsável interno e obrigações da empresa.
          </p>
        </div>

        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-1.5">
            <Label for="responsibleAccountantId" class="font-medium text-foreground"
              >Contador responsável</Label
            >
            <select
              id="responsibleAccountantId"
              v-model="responsibleAccountantId"
              class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
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

        <div class="flex flex-col gap-3 pt-2">
          <div
            v-for="flag in availableFlags"
            :key="flag.key"
            class="flex items-center gap-3 rounded-lg border border-border/60 bg-sunken/40 px-3.5 py-2.5 transition-colors hover:bg-sunken/70"
          >
            <input
              type="checkbox"
              :id="'flag-' + flag.key"
              v-model="flags[flag.key]"
              class="size-4 rounded border-border text-primary focus:ring-ring accent-primary"
            />
            <Label :for="'flag-' + flag.key" class="font-medium cursor-pointer text-foreground">{{
              flag.label
            }}</Label>
          </div>
        </div>
      </section>

      <div class="border-border flex items-center gap-3 border-t pt-4">
        <Button variant="ghost" type="button" @click="router.back()">Cancelar</Button>
        <Button type="submit" :disabled="saving || !formValid" class="shadow-xs font-medium">
          {{ saving ? 'Salvando...' : 'Salvar empresa' }}
        </Button>
      </div>
    </div>

    <div
      class="bg-card border-border flex w-full flex-col gap-6 rounded-xl border p-6 shadow-sm lg:sticky lg:top-8 lg:w-[24rem]"
    >
      <div>
        <Label for="checklistTemplateId" class="mb-2 block font-medium text-foreground"
          >Checklist aplicado</Label
        >
        <select
          id="checklistTemplateId"
          v-model="checklistTemplateId"
          class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
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
        class="border-border border-t pt-5"
      >
        <div class="flex items-center justify-between gap-4">
          <h3 class="text-sm font-semibold font-display text-foreground">
            Prévia do checklist
            <span
              v-if="preview.customized"
              class="text-muted-foreground font-normal text-xs block sm:inline"
            >
              (inclui ajustes desta empresa)
            </span>
          </h3>
          <span
            class="bg-primary/10 text-primary border border-primary/20 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold shrink-0"
          >
            {{ preview.total }} itens
          </span>
        </div>

        <div class="mt-4 flex flex-col gap-4">
          <div
            v-for="[category, items] in preview.groups"
            :key="category"
            class="flex flex-col gap-2 rounded-lg bg-sunken/40 p-3 border border-border/50"
          >
            <h4 class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {{ CATEGORY_LABEL[category] ?? category }}
            </h4>
            <ul class="flex flex-col gap-2.5">
              <li v-for="item in items" :key="item.key" class="text-sm flex flex-col">
                <span class="font-medium text-foreground flex items-center justify-between gap-2">
                  <span>{{ item.name }}</span>
                  <span
                    v-if="item.fromOverride"
                    class="inline-flex rounded-full bg-info-surface border border-info-border px-1.5 py-0.5 text-[10px] font-semibold text-info-foreground"
                  >
                    ajuste
                  </span>
                </span>
                <span
                  class="text-muted-foreground mt-0.5 text-xs flex flex-wrap items-center gap-1.5"
                >
                  <span>{{ PERIODICITY_LABEL[item.periodicity] ?? item.periodicity }}</span>
                  <span v-if="item.conditionFlag" class="text-warning-foreground font-medium">
                    &middot; Se {{ FLAG_LABEL[item.conditionFlag] }}
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
