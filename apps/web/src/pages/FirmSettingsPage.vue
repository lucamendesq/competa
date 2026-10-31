<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { DEFAULT_REMINDER_SETTINGS, UpdateFirmBody } from '@competa/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/PageHeader.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import Callout from '@/components/Callout.vue';
import PlanGateNotice from '@/components/PlanGateNotice.vue';
import { getFirm, updateFirm } from '@/features/firm/api/firm';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'vue-sonner';
import { apiErrorMessage, apiFieldErrors } from '@/api/error';

const auth = useAuthStore();
const queryClient = useQueryClient();

const isOwner = computed(() => auth.accountant?.accountant.owner === true);
const canBrand = computed(() => auth.can('branding'));
const canTuneReminders = computed(() => auth.can('reminderTuning'));

const firmQuery = useQuery({ queryKey: ['accountingFirm'], queryFn: getFirm });

const draft = ref({
  name: '',
  contactEmail: '',
  cnpj: '',
  logoUrl: '',
  reminderMax: 2,
  reminderDueSoonDays: 3,
  reminderGapDays: 3,
});

/* Sem a capability o cron ignora o que está gravado (as colunas sobrevivem ao downgrade para
 * o re-upgrade restaurá-las); a tela mostra o que vale, não o que está guardado. */
const remindersInEffect = (loaded: NonNullable<typeof firmQuery.data.value>) =>
  canTuneReminders.value
    ? {
        reminderMax: loaded.reminderMax,
        reminderDueSoonDays: loaded.reminderDueSoonDays,
        reminderGapDays: loaded.reminderGapDays,
      }
    : { ...DEFAULT_REMINDER_SETTINGS };

watch(
  () => firmQuery.data.value,
  (loaded) => {
    if (!loaded) return;
    draft.value = {
      name: loaded.name,
      contactEmail: loaded.contactEmail ?? '',
      cnpj: loaded.cnpj ?? '',
      logoUrl: loaded.logoUrl ?? '',
      ...remindersInEffect(loaded),
    };
  },
  { immediate: true },
);

const fieldErrors = ref<Record<string, string>>({});
const saving = ref(false);

const saveMutation = useMutation({
  mutationFn: updateFirm,
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accountingFirm'] }),
});

const REMINDER_FIELDS = ['reminderMax', 'reminderDueSoonDays', 'reminderGapDays'] as const;

async function save() {
  if (saving.value) return;
  fieldErrors.value = {};

  /* Campo apagado chega como '' e `Number('')` é 0: o lembrete vazio virava "0 desliga as
   * cobranças" sem ninguém ter escolhido isso. */
  const blankReminders = canTuneReminders.value
    ? REMINDER_FIELDS.filter((field) => String(draft.value[field] ?? '').trim() === '')
    : [];
  if (blankReminders.length) {
    fieldErrors.value = Object.fromEntries(
      blankReminders.map((field) => [field, 'Preencha este campo.']),
    );
    return;
  }

  /* Sem a capability, os três knobs nem entram no corpo: mandá-los faria o PATCH tomar 402
   * mesmo quando o Contador só renomeou o escritório. */
  const parsed = UpdateFirmBody.safeParse({
    name: draft.value.name,
    contactEmail: draft.value.contactEmail,
    logoUrl: draft.value.logoUrl,
    ...(draft.value.cnpj.trim() ? { cnpj: draft.value.cnpj } : {}),
    ...(canTuneReminders.value
      ? {
          reminderMax: Number(draft.value.reminderMax),
          reminderDueSoonDays: Number(draft.value.reminderDueSoonDays),
          reminderGapDays: Number(draft.value.reminderGapDays),
        }
      : {}),
  });

  if (!parsed.success) {
    fieldErrors.value = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
    );
    return;
  }

  /* Só o que esta janela mudou: com outra aba aberta, reenviar o rascunho inteiro desfazia
   * em silêncio o que a outra acabou de salvar. */
  const loaded = firmQuery.data.value;
  const changed = Object.fromEntries(
    Object.entries(parsed.data).filter(
      ([key, value]) => !loaded || (loaded[key as keyof typeof loaded] ?? null) !== value,
    ),
  ) as UpdateFirmBody;

  if (Object.keys(changed).length === 0) {
    toast.success('Nada para salvar.');
    return;
  }

  saving.value = true;
  try {
    await saveMutation.mutateAsync(changed);
    toast.success('Configurações salvas.');
    await auth.reloadAccountant();
  } catch (error) {
    fieldErrors.value = apiFieldErrors(error);
    toast.error(apiErrorMessage(error, 'Não foi possível salvar as configurações.'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <PageHeader
    title="Contabilidade"
    description="Dados do escritório e cadência das cobranças automáticas."
  />

  <main class="mt-8 max-w-2xl">
    <template v-if="firmQuery.isLoading.value">
      <LoadingRows :count="5" />
    </template>
    <template v-else-if="firmQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="firmQuery.refetch()" />
    </template>
    <form novalidate v-else class="flex flex-col gap-8" @submit.prevent="save">
      <Callout v-if="!isOwner" tone="info" heading="Somente leitura">
        Apenas o dono da Contabilidade pode alterar estas configurações.
      </Callout>

      <section class="bg-card border border-border shadow-sm rounded-xl p-6 flex flex-col gap-5">
        <h2 class="text-base font-semibold font-display text-foreground">Perfil</h2>

        <div class="flex flex-col gap-1.5">
          <Label for="firmName">Nome da Contabilidade</Label>
          <Input id="firmName" v-model="draft.name" :disabled="!isOwner" maxlength="120" />
          <p v-if="fieldErrors.name" class="text-danger text-xs">{{ fieldErrors.name }}</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="firmContactEmail">E-mail de contato</Label>
          <Input
            id="firmContactEmail"
            v-model="draft.contactEmail"
            type="email"
            :disabled="!isOwner"
            placeholder="contato@suacontabilidade.com.br"
          />
          <p class="text-muted-foreground text-xs">
            Aparece como resposta nos e-mails enviados aos Responsáveis.
          </p>
          <p v-if="fieldErrors.contactEmail" class="text-danger text-xs">
            {{ fieldErrors.contactEmail }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="firmCnpj">CNPJ da Contabilidade</Label>
          <Input
            id="firmCnpj"
            v-model="draft.cnpj"
            inputmode="numeric"
            :disabled="!isOwner"
            placeholder="00.000.000/0001-00"
          />
          <p class="text-muted-foreground text-xs">
            É o documento do pagador na fatura: obrigatório para assinar um plano.
          </p>
          <p v-if="fieldErrors.cnpj" class="text-danger text-xs">{{ fieldErrors.cnpj }}</p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="firmLogoUrl">URL do logo</Label>
          <Input
            id="firmLogoUrl"
            v-model="draft.logoUrl"
            :disabled="!isOwner || !canBrand"
            placeholder="https://..."
          />
          <p class="text-muted-foreground text-xs">
            Aparece no topo do Link de Upload e no cabeçalho dos e-mails. Endereço
            <code>https://</code> de uma imagem já publicada.
          </p>
          <img
            v-if="draft.logoUrl"
            :src="draft.logoUrl"
            :alt="`Logo de ${draft.name}`"
            class="border-border bg-card mt-1 h-10 w-auto max-w-[200px] self-start rounded-md border object-contain p-1"
            referrerpolicy="no-referrer"
          />
          <PlanGateNotice v-if="!canBrand" capability="branding">
            Sua marca no Link de Upload e nos e-mails
          </PlanGateNotice>
          <p v-if="fieldErrors.logoUrl" class="text-danger text-xs">{{ fieldErrors.logoUrl }}</p>
        </div>
      </section>

      <section class="bg-card border border-border shadow-sm rounded-xl p-6 flex flex-col gap-5">
        <h2 class="text-base font-semibold font-display text-foreground">Lembretes automáticos</h2>

        <p class="text-muted-foreground text-sm">
          A cobrança automática roda em todos os planos. O que muda aqui é a
          <strong>cadência</strong>: quantos lembretes, a partir de quantos dias do prazo e com que
          intervalo.
        </p>
        <PlanGateNotice v-if="!canTuneReminders" capability="reminderTuning">
          Ajustar a cadência dos lembretes
        </PlanGateNotice>

        <div class="flex flex-col gap-1.5">
          <Label for="reminderMax">Máximo de lembretes por item</Label>
          <Input
            id="reminderMax"
            v-model.number="draft.reminderMax"
            type="number"
            min="0"
            max="10"
            class="w-28"
            :disabled="!isOwner || !canTuneReminders"
          />
          <p class="text-muted-foreground text-xs">0 desliga as cobranças automáticas.</p>
          <p v-if="fieldErrors.reminderMax" class="text-danger text-xs">
            {{ fieldErrors.reminderMax }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="reminderDueSoonDays">Avisar quantos dias antes do prazo</Label>
          <Input
            id="reminderDueSoonDays"
            v-model.number="draft.reminderDueSoonDays"
            type="number"
            min="0"
            max="31"
            class="w-28"
            :disabled="!isOwner || !canTuneReminders"
          />
          <p v-if="fieldErrors.reminderDueSoonDays" class="text-danger text-xs">
            {{ fieldErrors.reminderDueSoonDays }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <Label for="reminderGapDays">Intervalo mínimo entre lembretes (dias)</Label>
          <Input
            id="reminderGapDays"
            v-model.number="draft.reminderGapDays"
            type="number"
            min="1"
            max="31"
            class="w-28"
            :disabled="!isOwner || !canTuneReminders"
          />
          <p v-if="fieldErrors.reminderGapDays" class="text-danger text-xs">
            {{ fieldErrors.reminderGapDays }}
          </p>
        </div>
      </section>

      <div v-if="isOwner" class="flex justify-end">
        <Button type="submit" :disabled="saving || !draft.name.trim()">
          {{ saving ? 'Salvando...' : 'Salvar configurações' }}
        </Button>
      </div>
    </form>
  </main>
</template>
