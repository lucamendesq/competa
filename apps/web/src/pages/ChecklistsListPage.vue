<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus, SquareCheckBig } from 'lucide-vue-next';
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
import ErrorState from '@/components/ErrorState.vue';
import LoadingRows from '@/components/LoadingRows.vue';
import EmptyState from '@/components/ui/empty/EmptyState.vue';
import Modal from '@/components/Modal.vue';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useChecklistsFeature } from '@/features/checklists/composables/useChecklistsFeature';
import type { Template } from '@/features/checklists/api/checklists';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';

const router = useRouter();
const { templatesQuery, deriveTemplateMutation, createTemplateMutation } = useChecklistsFeature();

const deriveOpen = ref<Template | null>(null);
const blankOpen = ref(false);
const newName = ref('');
const acting = ref(false);

function openBlank() {
  newName.value = '';
  blankOpen.value = true;
}

function openDerive(template: Template) {
  newName.value = template.name + ' (Cópia)';
  deriveOpen.value = template;
}

async function derive() {
  if (!newName.value.trim() || !deriveOpen.value) return;
  acting.value = true;
  try {
    const res = await deriveTemplateMutation.mutateAsync({
      id: deriveOpen.value.id,
      name: newName.value.trim(),
    });
    toast.success('Template copiado com sucesso.');
    router.push(`/templates/${res.id}`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível duplicar o template.'));
  } finally {
    acting.value = false;
    deriveOpen.value = null;
  }
}

async function createBlank() {
  if (!newName.value.trim()) return;
  acting.value = true;
  try {
    const res = await createTemplateMutation.mutateAsync(newName.value.trim());
    toast.success('Template criado com sucesso.');
    router.push(`/templates/${res.id}`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível criar o template.'));
  } finally {
    acting.value = false;
    blankOpen.value = false;
  }
}
</script>

<template>
  <PageHeader
    title="Templates de Checklist"
    description="Modelos de solicitação reutilizáveis por segmento ou regime."
  >
    <Button @click="openBlank" class="shadow-xs font-medium">
      <Plus class="mr-2 h-4 w-4" aria-hidden="true" />
      Criar checklist
    </Button>
  </PageHeader>

  <main class="mt-8">
    <template v-if="templatesQuery.isLoading.value">
      <LoadingRows />
    </template>
    <template v-else-if="templatesQuery.isError.value">
      <ErrorState title="Não foi possível carregar." @retry="templatesQuery.refetch()" />
    </template>
    <template v-else-if="templatesQuery.data.value?.length === 0">
      <EmptyState
        :icon="SquareCheckBig"
        title="Nenhum checklist encontrado"
        description="Crie um checklist do zero e escolha quais documentos cada empresa precisa enviar."
        action-label="Criar checklist"
        @action="openBlank"
      />
    </template>
    <template v-else>
      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader class="bg-sunken/60">
              <TableRow class="hover:bg-transparent border-border">
                <TableHead class="font-semibold text-foreground">Nome</TableHead>
                <TableHead class="font-semibold text-foreground">Itens</TableHead>
                <TableHead class="font-semibold text-foreground">Empresas usando</TableHead>
                <TableHead class="text-right font-semibold text-foreground">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow
                v-for="template in templatesQuery.data.value"
                :key="template.id"
                class="border-border hover:bg-slate-50/75 transition-colors"
              >
                <TableCell class="font-medium font-display text-foreground">
                  <div class="flex items-center gap-2">
                    <RouterLink
                      :to="`/templates/${template.id}`"
                      class="hover:text-primary transition-colors hover:underline"
                    >
                      {{ template.name }}
                    </RouterLink>
                    <span
                      v-if="template.isProduct"
                      class="bg-primary/10 text-primary border border-primary/20 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                    >
                      Padrão Competa
                    </span>
                  </div>
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  <span class="tabular-nums font-medium text-foreground">{{
                    template.itemCount
                  }}</span>
                  documentos
                </TableCell>
                <TableCell class="text-muted-foreground text-sm">
                  <span class="tabular-nums font-medium text-foreground">{{
                    template.companyCount
                  }}</span>
                </TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-1.5">
                    <Button
                      variant="ghost"
                      size="sm"
                      as-child
                      class="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <RouterLink :to="`/templates/${template.id}`"> Editar </RouterLink>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      class="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      @click="openDerive(template)"
                    >
                      <Plus class="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Duplicar
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </template>
  </main>

  <Modal
    :open="deriveOpen !== null"
    @update:open="$event ? null : (deriveOpen = null)"
    title="Duplicar template"
    :description="'Criar um novo template baseado em ' + deriveOpen?.name"
  >
    <form @submit.prevent="derive" class="mt-4 flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="deriveName" class="font-medium text-foreground">Nome do novo template</Label>
        <Input
          id="deriveName"
          v-model="newName"
          class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
          autofocus
        />
      </div>
      <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
        <Button variant="ghost" type="button" @click="deriveOpen = null">Cancelar</Button>
        <Button type="submit" :disabled="acting || !newName.trim()" class="shadow-xs font-medium">
          {{ acting ? 'Duplicando...' : 'Criar cópia' }}
        </Button>
      </div>
    </form>
  </Modal>

  <Modal
    :open="blankOpen"
    @update:open="$event ? null : ((blankOpen = false), (newName = ''))"
    title="Criar template em branco"
    description="Crie um novo template de documentos do zero."
  >
    <form @submit.prevent="createBlank" class="mt-4 flex flex-col gap-4">
      <div class="flex flex-col gap-1.5">
        <Label for="blankName" class="font-medium text-foreground">Nome do template</Label>
        <Input
          id="blankName"
          v-model="newName"
          class="focus-visible:ring-ring focus-visible:border-primary shadow-xs"
          autofocus
        />
      </div>
      <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
        <Button
          variant="ghost"
          type="button"
          @click="
            blankOpen = false;
            newName = '';
          "
          >Cancelar</Button
        >
        <Button type="submit" :disabled="acting || !newName.trim()" class="shadow-xs font-medium">
          {{ acting ? 'Criando...' : 'Criar template' }}
        </Button>
      </div>
    </form>
  </Modal>
</template>
