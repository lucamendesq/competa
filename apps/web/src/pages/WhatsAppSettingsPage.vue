<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useTitle } from '@vueuse/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/api/client';
import { toast } from 'vue-sonner';
import { Loader2, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-vue-next';

useTitle('Configurações do WhatsApp | Competa');

type WhatsAppStatus =
  | 'not_connected'
  | 'pending_phone'
  | 'pending_payment'
  | 'pending_template'
  | 'active'
  | 'suspended'
  | 'error';

interface WhatsAppStatusResponse {
  status: WhatsAppStatus;
  displayPhoneNumber?: string;
  wabaId?: string;
}

const status = ref<WhatsAppStatus>('not_connected');
const displayPhoneNumber = ref('');
const wabaId = ref('');
const loading = ref(true);
const processing = ref(false);

const testPhone = ref('');
const sendingTest = ref(false);

const fetchStatus = async () => {
  loading.value = true;
  try {
    const res = await api.get<WhatsAppStatusResponse>('/whatsapp/status');
    if (res) {
      status.value = res.status;
      displayPhoneNumber.value = res.displayPhoneNumber || '';
      wabaId.value = res.wabaId || '';
    }
  } catch (error) {
    console.error(error);
  } finally {
    loading.value = false;
  }
};

const connectWhatsApp = async () => {
  processing.value = true;
  try {
    const res = await api.post<WhatsAppStatusResponse>('/whatsapp/onboard', { code: 'mock_code' });
    if (res) {
      status.value = res.status;
      displayPhoneNumber.value = res.displayPhoneNumber || '';
      wabaId.value = res.wabaId || '';
    }

    toast({
      title: 'WhatsApp Conectado',
      description: 'A integração foi configurada com sucesso.',
    });
  } catch (error) {
    toast.error('Erro ao conectar', { description: 'Não foi possível configurar a integração.' });
  } finally {
    processing.value = false;
  }
};

const sendTestMessage = async () => {
  if (!testPhone.value) return;
  if (!confirm(`Enviar mensagem de teste para ${testPhone.value}?`)) return;

  sendingTest.value = true;
  try {
    await api.post('/whatsapp/test', { phone: testPhone.value });
    toast({
      title: 'Mensagem enviada',
      description: 'Verifique o celular de destino.',
    });
    testPhone.value = '';
  } catch (error) {
    toast.error('Erro no envio', { description: 'A mensagem de teste falhou.' });
  } finally {
    sendingTest.value = false;
  }
};

const disconnectWhatsApp = async () => {
  if (
    !confirm(
      'Tem certeza que deseja desconectar o WhatsApp? Novas solicitações voltarão a ser enviadas apenas por e-mail.',
    )
  ) {
    return;
  }

  processing.value = true;
  try {
    await api.delete('/whatsapp');
    status.value = 'not_connected';
    displayPhoneNumber.value = '';
    wabaId.value = '';

    toast({
      title: 'WhatsApp Desconectado',
      description: 'A integração foi removida com sucesso.',
    });
  } catch (error) {
    toast.error('Erro ao desconectar', { description: 'Não foi possível remover a integração.' });
  } finally {
    processing.value = false;
  }
};

onMounted(fetchStatus);
</script>

<template>
  <div class="space-y-6 max-w-4xl">
    <div>
      <h1 class="text-3xl font-bold tracking-tight font-display text-foreground">WhatsApp</h1>
      <p class="text-muted-foreground mt-1">
        Conecte sua conta do WhatsApp Business para enviar lembretes e solicitações aos seus
        clientes.
      </p>
    </div>

    <Card v-if="loading" class="flex justify-center p-12 border border-border shadow-sm rounded-xl">
      <Loader2 class="h-8 w-8 animate-spin text-muted-foreground" />
    </Card>

    <div v-else class="space-y-6">
      <Card v-if="status === 'not_connected'" class="border border-border shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 font-display">
            <MessageSquare class="h-5 w-5 text-primary" />
            Integrar WhatsApp
          </CardTitle>
          <CardDescription>
            Conecte sua conta Meta (Facebook) para habilitar o envio oficial de mensagens de
            WhatsApp.
          </CardDescription>
        </CardHeader>
        <CardContent class="space-y-4 text-sm text-muted-foreground">
          <p>O envio via WhatsApp aumenta em até 80% a taxa de entrega dos documentos no prazo.</p>
          <div class="rounded-xl border border-warning-border bg-warning-surface p-4 text-warning-foreground">
            <p class="font-semibold text-warning-foreground mb-1">Atenção aos custos</p>
            <p class="leading-relaxed">
              O serviço de mensagens do WhatsApp / Meta Cloud API é cobrado diretamente pela Meta
              (Facebook) através do cartão de crédito cadastrado na sua conta empresarial. A
              assinatura do Competa cobre apenas a plataforma de software.
            </p>
          </div>
        </CardContent>
        <CardFooter class="border-t border-border px-6 py-4">
          <Button @click="connectWhatsApp" :disabled="processing">
            <Loader2 v-if="processing" class="mr-2 h-4 w-4 animate-spin" />
            Conectar com o Facebook
          </Button>
        </CardFooter>
      </Card>

      <Card v-else class="border border-border shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle class="flex items-center gap-2 font-display">
            <CheckCircle2 v-if="status === 'active'" class="h-5 w-5 text-emerald-600" />
            <AlertCircle v-else class="h-5 w-5 text-amber-600" />
            Integração Ativa
          </CardTitle>
          <CardDescription> Gerencie sua conexão com o WhatsApp Business. </CardDescription>
        </CardHeader>
        <CardContent class="space-y-6">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="space-y-1 bg-muted/30 p-3.5 rounded-lg border border-border/60">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Número de Disparo</span>
              <p class="text-base font-medium text-foreground">{{ displayPhoneNumber }}</p>
            </div>
            <div class="space-y-1 bg-muted/30 p-3.5 rounded-lg border border-border/60">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status da Conexão</span>
              <p class="text-base font-medium text-foreground capitalize">{{ status.replace('_', ' ') }}</p>
            </div>
            <div class="space-y-1 bg-muted/30 p-3.5 rounded-lg border border-border/60 md:col-span-2">
              <span class="text-xs font-semibold text-muted-foreground uppercase tracking-wider">WABA ID</span>
              <p class="text-sm font-mono text-muted-foreground break-all">{{ wabaId }}</p>
            </div>
          </div>
        </CardContent>
        <CardFooter class="flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between border-t border-border px-6 py-4">
          <p class="text-xs text-muted-foreground">
            Lembre-se: os custos de disparo são faturados pela Meta.
          </p>
          <Button variant="destructive" @click="disconnectWhatsApp" :disabled="processing">
            Desconectar
          </Button>
        </CardFooter>
      </Card>

      <Card v-if="status === 'active'" class="border border-border shadow-sm rounded-xl">
        <CardHeader>
          <CardTitle class="font-display">Disparo de Teste</CardTitle>
          <CardDescription
            >Envie uma mensagem para validar se sua integração está funcionando.</CardDescription
          >
        </CardHeader>
        <CardContent>
          <div class="flex max-w-sm items-center gap-2">
            <Input
              v-model="testPhone"
              type="text"
              placeholder="Ex: 5511999999999"
              class="w-full"
            />
            <Button
              @click="sendTestMessage"
              :disabled="sendingTest || !testPhone"
              variant="secondary"
            >
              <Loader2 v-if="sendingTest" class="mr-2 h-4 w-4 animate-spin" />
              Testar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
