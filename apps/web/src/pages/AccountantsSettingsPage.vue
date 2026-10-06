<script setup lang="ts">
import { computed, ref } from 'vue';
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query';
import { Copy, Mail, Trash2, UserPlus } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import StatusPill from '@/components/StatusPill.vue';
import {
  createInvite,
  getAccountants,
  getPendingInvites,
  removeAccountant,
  revokeInvite,
  type PendingInvite,
  type TeamAccountant,
} from '@/features/team/api/team';
import { useAuthStore } from '@/stores/auth';
import { toast } from 'vue-sonner';
import { apiErrorMessage } from '@/api/error';
import { dateTimeBr } from '@/utils/format';

const auth = useAuthStore();
const queryClient = useQueryClient();

const isOwner = computed(() => auth.accountant?.accountant.owner === true);

const accountantsQuery = useQuery({ queryKey: ['accountants'], queryFn: getAccountants });
const invitesQuery = useQuery({ queryKey: ['invites'], queryFn: getPendingInvites });

const inviteOpen = ref(false);
const inviteEmail = ref('');
const inviteUrl = ref<string | null>(null);
const confirmRemoval = ref<TeamAccountant | null>(null);
const confirmRevoke = ref<PendingInvite | null>(null);

const inviteMutation = useMutation({
  mutationFn: (email: string) => createInvite(email),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
});

const removeMutation = useMutation({
  mutationFn: (id: string) => removeAccountant(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accountants'] }),
});

const revokeMutation = useMutation({
  mutationFn: (id: string) => revokeInvite(id),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['invites'] }),
});

function openInvite() {
  inviteEmail.value = '';
  inviteUrl.value = null;
  inviteOpen.value = true;
}

async function sendInvite() {
  const email = inviteEmail.value.trim();
  if (!email) return;
  try {
    const created = await inviteMutation.mutateAsync(email);
    inviteUrl.value = created.url;
    toast.success(`Convite enviado para ${created.email}.`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível enviar o convite.'));
  }
}

async function copyInviteUrl() {
  if (!inviteUrl.value) return;
  try {
    await navigator.clipboard.writeText(inviteUrl.value);
    toast.success('Link do convite copiado.');
  } catch {
    toast.error('Não foi possível copiar o link.');
  }
}

async function doRemove() {
  const target = confirmRemoval.value;
  if (!target) return;
  try {
    await removeMutation.mutateAsync(target.id);
    toast.success(`${target.name} removido da equipe.`);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível remover o contador.'));
  } finally {
    confirmRemoval.value = null;
  }
}

async function doRevoke() {
  const target = confirmRevoke.value;
  if (!target) return;
  try {
    await revokeMutation.mutateAsync(target.id);
    toast.success('Convite revogado.');
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível revogar o convite.'));
  } finally {
    confirmRevoke.value = null;
  }
}
</script>

<template>
  <PageHeader title="Equipe" description="Contadores com acesso a esta Contabilidade.">
    <Button v-if="isOwner" @click="openInvite">
      <UserPlus class="mr-2 h-4 w-4" aria-hidden="true" /> Convidar contador
    </Button>
  </PageHeader>

  <main class="mt-8 flex flex-col gap-8">
    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Contadores
      </h2>
      <template v-if="accountantsQuery.isLoading.value">
        <LoadingRows />
      </template>
      <template v-else-if="accountantsQuery.isError.value">
        <ErrorState
          title="Não foi possível carregar a equipe."
          @retry="accountantsQuery.refetch()"
        />
      </template>
      <div v-else class="bg-card border-border overflow-hidden rounded-xl border shadow-sm">
        <div class="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead class="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="row in accountantsQuery.data.value ?? []" :key="row.id">
                <TableCell class="font-medium">{{ row.name }}</TableCell>
                <TableCell class="text-muted-foreground">{{ row.email }}</TableCell>
                <TableCell>
                  <StatusPill
                    :status="row.owner ? 'active' : 'neutral'"
                    :text="row.owner ? 'Dono' : 'Contador'"
                  />
                </TableCell>
                <TableCell class="text-right">
                  <Button
                    v-if="isOwner && !row.owner"
                    variant="ghost"
                    size="sm"
                    class="text-danger hover:text-danger hover:bg-danger/10"
                    @click="confirmRemoval = row"
                  >
                    <Trash2 class="mr-2 h-4 w-4" /> Remover
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </section>

    <section>
      <h2 class="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        Convites pendentes
      </h2>
      <template v-if="invitesQuery.isLoading.value">
        <LoadingRows :count="2" />
      </template>
      <template v-else-if="invitesQuery.isError.value">
        <ErrorState
          title="Não foi possível carregar os convites."
          @retry="invitesQuery.refetch()"
        />
      </template>
      <div
        v-else-if="(invitesQuery.data.value ?? []).length === 0"
        class="border-border rounded-xl border-2 border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        Nenhum convite aguardando aceite.
      </div>
      <ul v-else class="bg-card border-border divide-border divide-y rounded-xl border shadow-sm">
        <li
          v-for="row in invitesQuery.data.value"
          :key="row.id"
          class="flex flex-wrap items-center justify-between gap-2 p-3"
        >
          <div class="min-w-0">
            <p class="flex items-center gap-2 text-sm font-medium">
              <Mail class="h-4 w-4 text-muted-foreground" /> {{ row.email }}
            </p>
            <p class="text-muted-foreground text-xs">Expira em {{ dateTimeBr(row.expiresAt) }}</p>
          </div>
          <Button
            v-if="isOwner"
            variant="ghost"
            size="sm"
            class="text-danger hover:text-danger hover:bg-danger/10"
            @click="confirmRevoke = row"
          >
            Revogar
          </Button>
        </li>
      </ul>
    </section>

    <p v-if="!isOwner" class="text-muted-foreground text-xs">
      Apenas o dono da Contabilidade pode convidar ou remover contadores.
    </p>
  </main>

  <Modal
    v-model:open="inviteOpen"
    title="Convidar contador"
    description="O convidado recebe um e-mail com o link para criar a conta."
  >
    <form v-if="!inviteUrl" class="mt-4 flex flex-col gap-4" @submit.prevent="sendInvite">
      <div class="flex flex-col gap-1.5">
        <Label for="inviteEmail">E-mail</Label>
        <Input id="inviteEmail" v-model="inviteEmail" type="email" autofocus required />
      </div>
      <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
        <Button variant="ghost" type="button" @click="inviteOpen = false">Cancelar</Button>
        <Button type="submit" :disabled="inviteMutation.isPending.value || !inviteEmail.trim()">
          {{ inviteMutation.isPending.value ? 'Enviando...' : 'Enviar convite' }}
        </Button>
      </div>
    </form>
    <div v-else class="mt-4 flex flex-col gap-3">
      <p class="text-sm">Convite criado. Se o e-mail não chegar, passe este link:</p>
      <code class="bg-muted break-all rounded-md p-3 text-xs">{{ inviteUrl }}</code>
      <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-2 flex justify-end gap-2 border-t p-4">
        <Button variant="outline" @click="copyInviteUrl">
          <Copy class="mr-2 h-4 w-4" /> Copiar link
        </Button>
        <Button @click="inviteOpen = false">Fechar</Button>
      </div>
    </div>
  </Modal>

  <Modal
    :open="confirmRemoval !== null"
    @update:open="$event ? null : (confirmRemoval = null)"
    title="Remover contador?"
    description="A sessão e as passkeys dele são revogadas imediatamente."
  >
    <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="confirmRemoval = null">Cancelar</Button>
      <Button variant="destructive" :disabled="removeMutation.isPending.value" @click="doRemove">
        Remover
      </Button>
    </div>
  </Modal>

  <Modal
    :open="confirmRevoke !== null"
    @update:open="$event ? null : (confirmRevoke = null)"
    title="Revogar convite?"
    description="O link enviado deixa de funcionar."
  >
    <div class="border-border bg-muted/40 -mx-6 -mb-6 mt-5 flex justify-end gap-2 border-t p-4">
      <Button variant="ghost" @click="confirmRevoke = null">Cancelar</Button>
      <Button variant="destructive" :disabled="revokeMutation.isPending.value" @click="doRevoke">
        Revogar
      </Button>
    </div>
  </Modal>
</template>
