<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import {
  Bell,
  Camera,
  CheckCircle2,
  CircleCheck,
  File as FileIcon,
  Link2Off,
  Lock,
  LogIn,
  PartyPopper,
  Upload,
} from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import LoadingRows from '@/components/LoadingRows.vue';
import StatusPill from '@/components/StatusPill.vue';
import ResendNotice from '@/components/ResendNotice.vue';
import UploadFeedback from '@/components/UploadFeedback.vue';
import Logo from '@/components/Logo.vue';
import InstallButton from '@/components/InstallButton.vue';
import { useUploadFeature } from '@/features/upload/composables/useUploadFeature';
import { usePush } from '@/composables/usePush';
import { dateBr, monthLabel } from '@/utils/format';
import { displayItemStatus, needsResend } from '@/utils/item-status';
import { isOverdue } from '@/utils/format';
import { toast } from 'vue-sonner';
import { ApiError, apiErrorCode, apiErrorMessage, failureKind } from '@/api/error';
import TermsConsent from '@/components/TermsConsent.vue';

const route = useRoute();
const token = computed(() => route.params.linkToken as string);

const feature = useUploadFeature(token.value);
const { checklistQuery, subscribePushMutation, activateAccessMutation, sendFiles } = feature;

const push = usePush();

/* Marca do escritório no lugar da nossa, na mesma altura do cabeçalho: no celular o
 * conteúdo de upload não pode descer nem um pixel por causa do logo. URL quebrada cai de
 * volta na marca Competa em vez de deixar imagem quebrada numa página pública.
 * `referrerpolicy="no-referrer"` é obrigatório: a URL desta página CARREGA o token do Link
 * de Upload, e sem isso ela vai no Referer para o host do logo — que é escolhido pelo
 * tenant e pode ser qualquer um. */
const firmLogoUrl = computed(() => checklistQuery.data.value?.accountingFirmLogoUrl ?? null);

/* Só 404/410/403 dizem que o link morreu. Um 429 (o limite de 60/min é dividido com os
 * envios) ou uma falha do servidor é passageira: mandar a pessoa pedir link novo por isso
 * era mentir para ela. */
const linkTemporarilyUnavailable = computed(() => {
  const error = checklistQuery.error.value;
  const kind = failureKind(error);
  return (
    kind === 'offline' || kind === 'server' || (error instanceof ApiError && error.status === 429)
  );
});
const logoBroken = ref(false);
const activatingAccess = ref(false);
const accountExists = ref(false);
const accessEmailSent = ref<string | null>(null);

/* Este link circula por email encaminhado, histórico e log de proxy: quem o tem não provou
 * controlar a caixa, então ele não dá senha nem sessão. A ativação só dispara o magic link;
 * a senha, se o Responsável quiser uma, nasce depois, já dentro da Minha Área. */
async function handleActivateAccess() {
  activatingAccess.value = true;
  try {
    const activated = await activateAccessMutation.mutateAsync({});
    accessEmailSent.value = activated.email;
    toast.success(
      `Enviamos um link de acesso para ${activated.email}. Abra seu email para entrar.`,
    );
  } catch (error) {
    if (
      apiErrorCode(error) === 'EMAIL_ALREADY_REGISTERED' ||
      apiErrorCode(error) === 'CONTACT_ACCESS_ALREADY_EXISTS'
    ) {
      accountExists.value = true;
      toast.info('Seu e-mail já possui uma conta ativa. Acesse em /minha-area/acesso.');
    } else {
      toast.error(apiErrorMessage(error, 'Não foi possível enviar o link de acesso.'));
    }
  } finally {
    activatingAccess.value = false;
  }
}

async function subscribeToPush() {
  await push.subscribe((payload) => subscribePushMutation.mutateAsync(payload));
}

const closed = computed(() => checklistQuery.data.value?.status === 'closed');

const progress = computed(() => {
  const items = checklistQuery.data.value?.items ?? [];
  const delivered = items.filter((item) => item.status !== 'pending' && item.status !== 'rejected');
  return {
    total: items.length,
    delivered: delivered.length,
    percent: items.length ? Math.round((delivered.length / items.length) * 100) : 0,
  };
});

const allSent = computed(() => {
  const items = checklistQuery.data.value?.items ?? [];
  return (
    items.length > 0 &&
    items.every((item) => item.status !== 'pending' && item.status !== 'rejected')
  );
});

/* Só `needsResend` muda de posição (precisa chamar atenção lá em cima). Fora isso, a
 * ordem é sempre alfabética e não se mexe quando o status do item muda — um envio bem
 * sucedido não pode fazer o item pular para o fim da lista embaixo do que ainda falta
 * enviar, senão quem está preenchendo a lista perde a referência visual de onde estava. */
const sortedItems = computed(() => {
  const items = [...(checklistQuery.data.value?.items ?? [])];
  const rank = (item: any) => (needsResend(item) ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
});

const expanded = ref<string | null>(null);
const sending = ref(false);
const results = ref<any[] | null>(null);

function toggle(itemId: string) {
  expanded.value = expanded.value === itemId ? null : itemId;
}

async function pick(event: Event, requestItemId: string | null) {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length) await send(files, requestItemId);
}

async function drop(event: DragEvent, requestItemId: string | null) {
  const files = [...(event.dataTransfer?.files ?? [])];
  if (files.length) await send(files, requestItemId);
}

const retryTarget = ref<string | null>(null);

async function send(files: File[], requestItemId: string | null) {
  retryTarget.value = requestItemId;
  sending.value = true;
  results.value = null;

  try {
    const res = await sendFiles(files, requestItemId);
    results.value = res;
    if (res.every((r) => r.ok)) {
      toast.success(
        res.length === 1 ? 'Arquivo enviado com sucesso.' : `${res.length} arquivos enviados.`,
      );
      if (requestItemId && expanded.value === requestItemId) expanded.value = null;
    }
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível enviar os arquivos.'));
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="bg-background flex min-h-dvh flex-col items-center">
    <header
      class="bg-white border-b border-border w-full px-4 py-3 flex items-center justify-between sm:px-6"
    >
      <div v-if="firmLogoUrl && !logoBroken" class="flex min-w-0 items-center gap-2">
        <img
          :src="firmLogoUrl"
          alt=""
          class="h-6 w-auto max-w-[120px] shrink-0 object-contain"
          referrerpolicy="no-referrer"
          @error="logoBroken = true"
        />
        <span class="truncate text-sm font-semibold text-foreground">
          {{ checklistQuery.data.value?.accountingFirm }}
        </span>
      </div>
      <Logo v-else variant="icon" surface="auto" class="h-6" />
      <InstallButton variant="card" />
    </header>

    <main
      v-if="checklistQuery.isLoading.value"
      class="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6"
      aria-label="Carregando"
    >
      <LoadingRows :count="5" />
    </main>

    <main
      v-else-if="checklistQuery.isError.value && linkTemporarilyUnavailable"
      class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6 text-center"
    >
      <h1 class="font-display text-xl font-semibold tracking-tight">
        Não foi possível abrir agora
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">
        Seu link continua valendo. Aguarde um minuto e tente de novo.
      </p>
      <Button class="mt-6" variant="outline" @click="checklistQuery.refetch()">
        Tentar de novo
      </Button>
    </main>

    <main
      v-else-if="checklistQuery.isError.value"
      class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6 text-center"
    >
      <Link2Off class="text-muted-foreground h-16 w-16" aria-hidden="true" />
      <h1 class="font-display mt-4 text-xl font-semibold tracking-tight">
        Link indisponível ou expirado
      </h1>
      <p class="text-muted-foreground mt-2 text-sm">
        O link de envio expirou ou a competência foi encerrada. Peça um novo link para a
        contabilidade.
      </p>
    </main>

    <main
      v-else-if="checklistQuery.data.value"
      class="mx-auto w-full max-w-2xl flex-1 p-4 pb-12 sm:p-6"
    >
      <div class="mb-6 flex flex-col items-center text-center">
        <h1 class="font-display text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {{ checklistQuery.data.value.company }}
        </h1>
        <p class="text-muted-foreground mt-1 text-sm">
          Documentos da competência
          <strong>{{ monthLabel(checklistQuery.data.value.referenceMonth) }}</strong>
        </p>
        <p class="text-muted-foreground text-xs">
          Aos cuidados de {{ checklistQuery.data.value.accountingFirm }}
        </p>
      </div>

      <div
        class="bg-card border-border mb-6 flex items-center justify-between gap-4 rounded-xl border p-4 shadow-sm"
      >
        <div>
          <p class="text-sm font-medium">Progresso de envio</p>
          <p class="text-muted-foreground text-xs">
            {{ progress.delivered }} de {{ progress.total }} itens entregues
          </p>
        </div>
        <div class="bg-muted relative h-12 w-12 rounded-full">
          <svg class="h-full w-full -rotate-90" viewBox="0 0 36 36">
            <path
              class="text-border"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
            />
            <path
              class="text-primary transition-all duration-500 ease-out"
              :stroke-dasharray="progress.percent + ', 100'"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              stroke-width="3.5"
            />
          </svg>
        </div>
      </div>

      <div
        v-if="accessEmailSent"
        class="border-emerald-500/30 bg-emerald-500/5 mb-6 rounded-xl border p-4 shadow-sm"
      >
        <div class="flex items-start gap-3">
          <span
            class="bg-emerald-500/10 text-emerald-600 flex size-9 shrink-0 items-center justify-center rounded-lg mt-0.5"
          >
            <CheckCircle2 class="h-4 w-4" />
          </span>
          <div>
            <p class="text-sm font-semibold text-foreground">Link de acesso enviado!</p>
            <p class="text-muted-foreground text-xs mt-0.5">
              Abra o email que mandamos para {{ accessEmailSent }} e entre pelo link. De lá você
              acompanha histórico e pendências — e pode cadastrar uma senha, se quiser.
            </p>
          </div>
        </div>
      </div>

      <div
        v-else-if="!allSent && !closed && !checklistQuery.data.value.hasAccess"
        class="bg-card border-border mb-6 rounded-xl border p-4 shadow-sm"
      >
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div class="flex items-start gap-3">
            <span
              class="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg mt-0.5"
            >
              <Lock class="h-4 w-4" />
            </span>
            <div>
              <p class="text-sm font-semibold text-foreground">
                Acesse quando quiser sem depender do link
              </p>
              <p class="text-muted-foreground text-xs mt-0.5">
                Mandamos um link de acesso para o seu email e você acompanha pendências e histórico
                na sua área exclusiva.
              </p>
              <TermsConsent action="Ao criar seu acesso" class="mt-1.5" />
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            class="shrink-0"
            :disabled="activatingAccess"
            @click="handleActivateAccess"
          >
            {{ activatingAccess ? 'Enviando…' : 'Criar meu acesso' }}
          </Button>
        </div>
      </div>

      <div
        v-else-if="(allSent || closed) && !checklistQuery.data.value.hasAccess"
        class="bg-primary/10 border-primary/20 mb-6 rounded-xl border p-5"
      >
        <div class="flex items-start gap-4">
          <PartyPopper class="text-primary mt-1 shrink-0 text-2xl" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-semibold tracking-tight text-foreground">
              Tudo entregue, mês fechado!
            </h2>
            <p class="mt-1 text-sm text-foreground/80">A contabilidade já foi notificada.</p>
            <template v-if="!push.subscribed.value">
              <p class="mt-3 text-sm text-foreground/80">
                Quer ser lembrado mês que vem e não depender do WhatsApp?
              </p>
              <div class="mt-4 flex flex-wrap gap-2">
                <p v-if="accessEmailSent" class="mt-3 text-sm font-medium text-foreground">
                  Enviamos um link de acesso para {{ accessEmailSent }}. Abra seu email para entrar.
                </p>
                <Button v-else-if="accountExists" variant="default" as-child>
                  <RouterLink to="/minha-area/acesso">
                    <LogIn class="mr-2 h-4 w-4" /> Entre na sua conta
                  </RouterLink>
                </Button>
                <template v-else-if="!accessEmailSent">
                  <Button
                    v-if="push.available.value"
                    variant="default"
                    @click="subscribeToPush"
                    :disabled="push.subscribing.value"
                  >
                    <Bell class="mr-2 h-4 w-4" />
                    {{ push.subscribing.value ? 'Ativando...' : 'Me avise neste aparelho' }}
                  </Button>
                  <Button
                    variant="outline"
                    :disabled="activatingAccess"
                    @click="handleActivateAccess"
                  >
                    <Lock class="mr-2 h-4 w-4" />
                    {{ activatingAccess ? 'Enviando…' : 'Criar meu acesso' }}
                  </Button>
                </template>
              </div>
              <TermsConsent
                v-if="!accessEmailSent && !accountExists"
                action="Ao criar seu acesso"
                class="mt-3"
              />
            </template>
          </div>
        </div>
      </div>

      <ul
        class="bg-card border-border divide-border divide-y rounded-xl border shadow-sm"
        role="list"
      >
        <li
          v-for="item in sortedItems"
          :key="item.id"
          class="flex flex-col transition-colors"
          :class="{
            'bg-amber-50/40': item.status === 'pending' && !needsResend(item),
            'bg-rose-50/30': needsResend(item),
          }"
        >
          <button
            type="button"
            class="hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-ring flex items-start justify-between gap-4 p-4 text-left focus-visible:outline-none transition-colors"
            :aria-expanded="expanded === item.id"
            :aria-controls="'upload-' + item.id"
            @click="toggle(item.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2 flex-wrap">
                <span class="truncate text-sm font-semibold text-foreground">{{ item.name }}</span>
                <StatusPill :status="displayItemStatus(item)" />
              </span>
              <span class="text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                <span
                  v-if="isOverdue(item.dueDate) && item.status !== 'accepted'"
                  class="font-semibold text-danger-foreground"
                >
                  Prazo {{ dateBr(item.dueDate) }}
                </span>
                <span v-else>Prazo {{ dateBr(item.dueDate) }}</span>
              </span>
            </span>
            <span
              class="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
              :class="{
                'bg-amber-100 text-amber-800': item.status === 'pending' && !needsResend(item),
                'bg-rose-100 text-rose-800': needsResend(item),
                'bg-emerald-100 text-emerald-800': item.status === 'accepted',
                'bg-sky-100 text-sky-800': item.status === 'submitted',
              }"
              aria-hidden="true"
            >
              <CheckCircle2 v-if="item.status === 'accepted'" class="h-4 w-4" />
              <Upload v-else class="h-4 w-4" />
            </span>
          </button>

          <div v-if="needsResend(item)" class="mx-4 mb-4">
            <ResendNotice :item="item" hint="Envie o documento corrigido no botão abaixo." />
          </div>

          <ul
            v-if="item.documents.length"
            class="border-border mx-4 mb-4 divide-y rounded-lg border bg-white"
            role="list"
          >
            <li
              v-for="(file, index) in item.documents"
              :key="index"
              class="flex items-center gap-2 p-3 text-sm"
            >
              <FileIcon class="text-muted-foreground shrink-0 h-4 w-4" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate font-medium text-foreground"
                >Arquivo {{ index + 1 }}</span
              >
              <StatusPill :status="file.reviewStatus" />
            </li>
          </ul>

          <div
            v-if="expanded === item.id"
            :id="'upload-' + item.id"
            class="border-border border-t p-4"
          >
            <p
              v-if="item.status === 'accepted'"
              class="text-muted-foreground flex items-center gap-2 text-sm"
            >
              <CircleCheck class="text-success text-base" aria-hidden="true" />
              Este documento já foi conferido e aprovado pela contabilidade.
            </p>
            <p v-else-if="closed" class="text-muted-foreground text-sm">
              Esta competência foi encerrada — envie pelo bloco de documento extra abaixo.
            </p>
            <div
              v-else-if="sending && retryTarget === item.id"
              class="border-border flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center bg-white/60"
              role="status"
              aria-live="polite"
            >
              <Upload class="text-primary animate-bounce text-xl" aria-hidden="true" />
              <span class="text-sm font-medium">Enviando arquivos…</span>
              <span class="text-muted-foreground text-xs">Aguarde a confirmação</span>
            </div>
            <div v-else>
              <label
                class="border-border hover:bg-muted/50 focus-within:ring-ring flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center focus-within:ring-2 bg-white"
                :class="{ 'opacity-50 pointer-events-none': sending }"
                @dragover.prevent
                @drop.prevent="drop($event, item.id)"
              >
                <Upload class="text-muted-foreground text-xl" aria-hidden="true" />
                <span class="text-sm font-medium"
                  >Arraste os arquivos aqui ou toque para escolher</span
                >
                <span class="text-muted-foreground text-xs"
                  >Pode enviar vários de uma vez, ou um .zip</span
                >
                <input
                  type="file"
                  multiple
                  class="sr-only"
                  :disabled="sending"
                  @change="pick($event, item.id)"
                />
              </label>

              <label
                class="border-border hover:bg-muted/50 focus-within:ring-ring mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium focus-within:ring-2 sm:hidden bg-white"
              >
                <Camera class="text-base" aria-hidden="true" />
                Tirar foto do documento
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  class="sr-only"
                  :disabled="sending"
                  @change="pick($event, item.id)"
                />
              </label>
            </div>
          </div>
        </li>
      </ul>

      <section class="bg-card border-border mt-6 rounded-xl border p-4 shadow-sm">
        <h2 class="font-display text-base font-semibold text-foreground">Enviar documento extra</h2>
        <p class="text-muted-foreground mt-1 text-sm">Se não estiver na lista acima, envie aqui.</p>

        <div
          v-if="sending && retryTarget === null"
          class="border-border mt-3 flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center bg-white"
          role="status"
          aria-live="polite"
        >
          <Upload class="text-primary animate-bounce text-xl" aria-hidden="true" />
          <span class="text-sm font-medium">Enviando arquivos…</span>
          <span class="text-muted-foreground text-xs">Aguarde a confirmação</span>
        </div>
        <label
          v-else
          class="border-border hover:bg-muted/50 focus-within:ring-ring mt-3 flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center focus-within:ring-2 bg-white"
          :class="{ 'opacity-50 pointer-events-none': sending }"
          @dragover.prevent
          @drop.prevent="drop($event, null)"
        >
          <span class="text-sm font-medium">Arraste os arquivos aqui ou toque para escolher</span>
          <span class="text-muted-foreground text-xs"
            >Documentos extras não passam pela conferência do checklist</span
          >
          <input
            type="file"
            multiple
            class="sr-only"
            :disabled="sending"
            @change="pick($event, null)"
          />
        </label>

        <ul
          v-if="checklistQuery.data.value.extraDocuments.length"
          class="border-border mt-3 divide-y rounded-lg border bg-white"
          role="list"
        >
          <li
            v-for="(file, index) in checklistQuery.data.value.extraDocuments"
            :key="index"
            class="flex items-center gap-2 p-3 text-sm"
          >
            <FileIcon class="text-muted-foreground shrink-0 h-4 w-4" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate font-medium text-foreground"
              >Documento extra {{ index + 1 }}</span
            >
            <StatusPill :status="file.reviewStatus" />
          </li>
        </ul>
      </section>

      <footer
        class="mt-8 flex flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground sm:flex-row sm:gap-4"
      >
        <template v-if="!checklistQuery.data.value.hasAccess && !accessEmailSent">
          <div>
            <span>Ainda não tem acesso? </span>
            <button
              type="button"
              class="font-medium text-foreground hover:underline"
              :disabled="activatingAccess"
              @click="handleActivateAccess"
            >
              Receber link de acesso
            </button>
          </div>
          <span class="hidden sm:inline text-border">·</span>
        </template>
        <div>
          <span>Já possui cadastro? </span>
          <RouterLink to="/minha-area/acesso" class="font-medium text-foreground hover:underline">
            Acessar Minha Área
          </RouterLink>
        </div>
      </footer>
    </main>

    <UploadFeedback
      :results="results"
      @dismiss="results = null"
      @retry="send($event, retryTarget)"
    />
  </div>
</template>
