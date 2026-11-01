<script setup lang="ts">
import { ref } from 'vue';
import { toast } from 'vue-sonner';
import { Button } from '@/components/ui/button';
import Modal from '@/components/Modal.vue';
import { closeRequest } from '@/features/requests/api/requests';
import { apiErrorMessage } from '@/api/error';

const props = defineProps<{
  open: boolean;
  requestId: string;
  companyName: string;
  unaccepted: number;
  toReview: number;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  closed: [];
}>();

const closing = ref(false);

async function confirm() {
  closing.value = true;
  try {
    const result = await closeRequest(props.requestId);
    toast.success(result.warning ?? `Solicitação de ${props.companyName} encerrada.`);
    emit('closed');
    emit('update:open', false);
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível encerrar a solicitação.'));
  } finally {
    closing.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    :title="`Encerrar a solicitação de ${companyName}?`"
    description="Encerrar é a palavra final para esta empresa nesta competência, mesmo com pendências."
    @update:open="emit('update:open', $event)"
  >
    <div class="flex flex-col gap-3 text-sm text-foreground">
      <p v-if="unaccepted">
        <strong class="tabular-nums">{{ unaccepted }}</strong> item(ns) ainda sem aceite.
      </p>
      <p v-else>Todos os itens já foram aceitos.</p>
      <p
        v-if="toReview"
        class="rounded-lg border border-danger-border bg-danger-surface p-3 text-danger-foreground"
      >
        <strong class="tabular-nums">{{ toReview }}</strong> item(ns) já enviado(s) e ainda não
        conferido(s). Depois de encerrar, esses documentos não poderão mais ser aceitos e ficam fora
        do zip final.
      </p>
      <p>O Responsável não poderá mais enviar documentos nos itens — apenas documentos extras.</p>
    </div>
    <div
      class="border-border bg-sunken/40 -mx-6 -mb-6 mt-6 flex flex-wrap justify-end gap-2.5 border-t p-4"
    >
      <Button variant="ghost" @click="emit('update:open', false)">Cancelar</Button>
      <Button variant="destructive" :disabled="closing" @click="confirm">
        {{ closing ? 'Encerrando...' : 'Encerrar solicitação' }}
      </Button>
    </div>
  </Modal>
</template>
