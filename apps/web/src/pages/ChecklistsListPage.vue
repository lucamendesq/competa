<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { Plus } from 'lucide-vue-next';
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
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';

const router = useRouter();
const { templatesQuery, deriveTemplateMutation } = useChecklistsFeature();

const deriveOpen = ref<any | null>(null);
const newName = ref('');
const acting = ref(false);

function openDerive(template: any) {
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
    toast.success('Template criado com sucesso.');
    router.push(`/templates/${res.id}`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível duplicar o template.'));
  } finally {
    acting.value = false;
    deriveOpen.value = null;
  }
}
</script>

<template>
  <PageHeader
    title="Templates de Checklist"
    description="Modelos de solicitação reutilizáveis por segmento ou regime."
  >
    <!-- Em Angular ele não tinha botão criar do zero facilmente, apenas derivava. Vamos deixar vazio ou adicionar um botão se tiver API. 
         Wait, derive endpoint can be used with a standard product template ID to create a blank one?
         Ah, in Angular there was no "Create blank template" button in `templates-list-page.html`. Wait, I will just provide what they had. -->
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
        title="Nenhum template encontrado"
        description="Você não possui templates configurados."
      />
    </template>
    <template v-else>
      <div class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Itens</TableHead>
                <TableHead>Empresas usando</TableHead>
                <TableHead class="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="template in templatesQuery.data.value" :key="template.id">
                <TableCell class="font-medium">
                  <RouterLink :to="`/templates/${template.id}`" class="hover:underline">
                    {{ template.name }}
                  </RouterLink>
                  <span
                    v-if="template.isProduct"
                    class="bg-primary/10 text-primary ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  >
                    Padrão Competa
                  </span>
                </TableCell>
                <TableCell>{{ template.itemCount }} documentos</TableCell>
                <TableCell>{{ template.companyCount }}</TableCell>
                <TableCell class="text-right">
                  <div class="flex items-center justify-end gap-2">
                    <Button variant="ghost" size="sm" as-child>
                      <RouterLink :to="`/templates/${template.id}`"> Editar </RouterLink>
                    </Button>
                    <Button variant="ghost" size="sm" @click="openDerive(template)">
                      <Plus class="mr-2 h-4 w-4" aria-hidden="true" /> Duplicar
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
        <Label for="newName">Nome do novo template</Label>
        <Input id="newName" v-model="newName" autofocus />
      </div>
      <div class="border-border bg-muted/40 -mx-5 -mb-5 mt-5 flex justify-end gap-2 border-t p-4">
        <Button variant="ghost" type="button" @click="deriveOpen = null">Cancelar</Button>
        <Button type="submit" :disabled="acting || !newName.trim()">
          {{ acting ? 'Duplicando...' : 'Criar cópia' }}
        </Button>
      </div>
    </form>
  </Modal>
</template>
