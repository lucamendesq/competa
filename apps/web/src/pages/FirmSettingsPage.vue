<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { UpdateFirmBody } from '@competa/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import PageHeader from '@/components/PageHeader.vue';
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import Callout from '@/components/Callout.vue';
import { getFirm, updateFirm } from '@/features/firm/api/firm';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'vue-sonner';
import { apiErrorMessage, apiFieldErrors } from '@/api/error';

const auth = useAuthStore();
const queryClient = useQueryClient();

const isOwner = computed(() => auth.accountant?.accountant.owner === true);

const firmQuery = useQuery({ queryKey: ['accountingFirm'], queryFn: getFirm });

const draft = ref({
  name: '',
  contactEmail: '',
  logoUrl: '',
  reminderMax: 2,
  reminderDueSoonDays: 3,
  reminderGapDays: 3,
});

watch(
  () => firmQuery.data.value,
  (loaded) => {
    if (!loaded) return;
    draft.value = {
      name: loaded.name,
      contactEmail: loaded.contactEmail ?? '',
      logoUrl: loaded.logoUrl ?? '',
      reminderMax: loaded.reminderMax,
      reminderDueSoonDays: loaded.reminderDueSoonDays,
      reminderGapDays: loaded.reminderGapDays,
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

async function save() {
  if (saving.value) return;
  fieldErrors.value = {};

  const parsed = UpdateFirmBody.safeParse({
    name: draft.value.name,
    contactEmail: draft.value.contactEmail,
    logoUrl: draft.value.logoUrl,
    reminderMax: Number(draft.value.reminderMax),
    reminderDueSoonDays: Number(draft.value.reminderDueSoonDays),
    reminderGapDays: Number(draft.value.reminderGapDays),
  });

  if (!parsed.success) {
    fieldErrors.value = Object.fromEntries(
      parsed.error.issues.map((issue) => [issue.path.join('.'), issue.message]),
    );
    return;
  }

  saving.value = true;
  try {
    await saveMutation.mutateAsync(parsed.data);
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
    <form v-else class="flex flex-col gap-8" @submit.prevent="save">
      <Callout v-if="!isOwner" tone="info" heading="Somente leitura">
        Apenas o dono da Contabilidade pode alterar estas configurações.
      </Callout>

      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Perfil</h2>

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
          <Label for="firmLogoUrl">URL do logo</Label>
          <Input
            id="firmLogoUrl"
            v-model="draft.logoUrl"
            :disabled="!isOwner"
            placeholder="https://..."
          />
          <p v-if="fieldErrors.logoUrl" class="text-danger text-xs">{{ fieldErrors.logoUrl }}</p>
        </div>
      </section>

      <section class="flex flex-col gap-4">
        <h2 class="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Lembretes automáticos
        </h2>

        <div class="flex flex-col gap-1.5">
          <Label for="reminderMax">Máximo de lembretes por item</Label>
          <Input
            id="reminderMax"
            v-model.number="draft.reminderMax"
            type="number"
            min="0"
            max="10"
            class="w-28"
            :disabled="!isOwner"
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
            :disabled="!isOwner"
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
            :disabled="!isOwner"
          />
          <p v-if="fieldErrors.reminderGapDays" class="text-danger text-xs">
            {{ fieldErrors.reminderGapDays }}
          </p>
        </div>
      </section>

      <div v-if="isOwner" class="flex justify-end">
        <Button type="submit" :disabled="saving">
          {{ saving ? 'Salvando...' : 'Salvar configurações' }}
        </Button>
      </div>
    </form>
  </main>
</template>
