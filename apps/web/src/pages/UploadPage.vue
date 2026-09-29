<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  Bell,
  Camera,
  File as FileIcon,
  Link2Off,
  Lock,
  LogIn,
  PartyPopper,
  Upload,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import StatusPill from '@/components/StatusPill.vue'
import ResendNotice from '@/components/ResendNotice.vue'
import UploadFeedback from '@/components/UploadFeedback.vue'
import Logo from '@/components/Logo.vue'
import { useUploadFeature } from '@/features/upload/composables/useUploadFeature'
import { usePush } from '@/composables/usePush'
import { dateBr, monthLabel } from '@/utils/format'
import { displayItemStatus, needsResend } from '@/utils/item-status'
import { isOverdue } from '@/utils/format'
import { toast } from 'vue-sonner'
import { apiErrorCode, apiErrorMessage } from '@/api/error'

const route = useRoute()
const router = useRouter()
const token = computed(() => route.params.linkToken as string)

const feature = useUploadFeature(token.value)
const { checklistQuery, subscribePushMutation, activateAccessMutation, sendFiles, dropTarget } = feature

const push = usePush()
const activatingAccess = ref(false)
const accountExists = ref(false)

async function subscribeToPush() {
  await push.subscribe((payload) => subscribePushMutation.mutateAsync(payload))
}

async function activateAccess() {
  activatingAccess.value = true
  try {
    await activateAccessMutation.mutateAsync()
    await router.push('/minha-area/definir-senha')
  } catch (error) {
    if (apiErrorCode(error) === 'EMAIL_ALREADY_REGISTERED') {
      accountExists.value = true
    } else {
      toast.error(apiErrorMessage(error, 'Não foi possível ativar seu acesso.'))
    }
  } finally {
    activatingAccess.value = false
  }
}

const closed = computed(() => checklistQuery.data.value?.status === 'closed')

const progress = computed(() => {
  const items = checklistQuery.data.value?.items ?? []
  const delivered = items.filter(
    (item) => item.status !== 'pending' && item.status !== 'rejected',
  )
  return {
    total: items.length,
    delivered: delivered.length,
    percent: items.length ? Math.round((delivered.length / items.length) * 100) : 0,
  }
})

const allSent = computed(() => {
  const items = checklistQuery.data.value?.items ?? []
  return items.length > 0 && items.every((item) => item.status !== 'pending' && item.status !== 'rejected')
})

const sortedItems = computed(() => {
  const items = [...(checklistQuery.data.value?.items ?? [])]
  const rank = (item: any) => {
    if (needsResend(item)) return 0
    if (item.status === 'pending') return 1
    if (item.status === 'submitted') return 2
    if (item.status === 'accepted') return 3
    return 4
  }
  return items.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
})

const expanded = ref<string | null>(null)
const sending = ref(false)
const results = ref<any[] | null>(null)

function toggle(itemId: string) {
  expanded.value = expanded.value === itemId ? null : itemId
}

async function pick(event: Event, requestItemId: string | null) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  if (files.length) await send(files, requestItemId)
}

const retryTarget = ref<string | null>(null)

async function send(files: File[], requestItemId: string | null) {
  retryTarget.value = requestItemId
  sending.value = true
  results.value = null

  try {
    const res = await sendFiles(files, requestItemId)
    results.value = res
    if (requestItemId && expanded.value === requestItemId && res.every((r) => r.ok)) {
      expanded.value = null
    }
  } catch (error) {
    toast.error(apiErrorMessage(error, 'Não foi possível enviar os arquivos.'))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="bg-muted flex min-h-dvh flex-col items-center">
    <header class="bg-sidebar w-full border-b px-4 py-3 text-center sm:px-6">
      <Logo variant="icon" surface="dark" class="h-6 opacity-80" />
    </header>

    <main v-if="checklistQuery.isLoading.value" class="mx-auto w-full max-w-2xl flex-1 p-4 sm:p-6" aria-label="Carregando">
      <!-- Loading skeleton could go here -->
    </main>

    <main v-else-if="checklistQuery.isError.value" class="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center p-6 text-center">
      <Link2Off class="text-muted-foreground h-16 w-16" aria-hidden="true" />
      <h1 class="mt-4 text-xl font-semibold tracking-tight">Link indisponível ou expirado</h1>
      <p class="text-muted-foreground mt-2 text-sm">
        O link de envio expirou ou a competência foi encerrada. Peça um novo link para a
        contabilidade.
      </p>
    </main>

    <main v-else-if="checklistQuery.data.value" class="mx-auto w-full max-w-2xl flex-1 p-4 pb-12 sm:p-6">
      <div class="mb-6 flex flex-col items-center text-center">
        <h1 class="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
          {{ checklistQuery.data.value.company }}
        </h1>
        <p class="text-muted-foreground mt-1 text-sm">
          Documentos da competência <strong>{{ monthLabel(checklistQuery.data.value.referenceMonth) }}</strong>
        </p>
        <p class="text-muted-foreground text-xs">
          Aos cuidados de {{ checklistQuery.data.value.accountingFirm }}
        </p>
      </div>

      <div class="bg-card border-border mb-6 flex items-center justify-between gap-4 rounded-xl border p-4 shadow-sm">
        <div>
          <p class="text-sm font-medium">Progresso de envio</p>
          <p class="text-muted-foreground text-xs">
            {{ progress.delivered }} de {{ progress.total }} itens entregues
          </p>
        </div>
        <div class="bg-muted relative h-12 w-12 rounded-full">
          <svg class="h-full w-full rotate-[-90deg]" viewBox="0 0 36 36">
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

      <div v-if="allSent && !checklistQuery.data.value.hasAccess && !closed" class="bg-primary/10 border-primary/20 mb-6 rounded-xl border p-5">
        <div class="flex items-start gap-4">
          <PartyPopper class="text-primary mt-1 shrink-0 text-2xl" aria-hidden="true" />
          <div class="min-w-0 flex-1">
            <h2 class="text-base font-semibold tracking-tight text-foreground">
              Tudo entregue, mês fechado!
            </h2>
            <p class="mt-1 text-sm text-foreground/80">
              A contabilidade já foi notificada.
            </p>
            <template v-if="!push.subscribed.value">
              <p class="mt-3 text-sm text-foreground/80">
                Quer ser lembrado mês que vem e não depender do WhatsApp?
              </p>
              <div class="mt-4 flex flex-wrap gap-2">
                <Button v-if="accountExists" variant="default" as-child>
                  <RouterLink to="/minha-area/acesso">
                    <LogIn class="mr-2 h-4 w-4" /> Entre na sua conta
                  </RouterLink>
                </Button>
                <template v-else>
                  <Button v-if="push.available.value" variant="default" @click="subscribeToPush" :disabled="push.subscribing.value">
                    <Bell class="mr-2 h-4 w-4" /> 
                    {{ push.subscribing.value ? 'Ativando...' : 'Me avise neste aparelho' }}
                  </Button>
                  <Button variant="outline" @click="activateAccess" :disabled="activatingAccess">
                    <Lock class="mr-2 h-4 w-4" /> 
                    {{ activatingAccess ? 'Criando...' : 'Criar senha de acesso' }}
                  </Button>
                </template>
              </div>
            </template>
          </div>
        </div>
      </div>

      <ul class="bg-card border-border divide-border divide-y rounded-xl border shadow-sm" role="list">
        <li v-for="item in sortedItems" :key="item.id" class="flex flex-col">
          <button
            type="button"
            class="hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:ring-ring flex items-start justify-between gap-4 p-4 text-left focus-visible:outline-none"
            :aria-expanded="expanded === item.id"
            :aria-controls="'upload-' + item.id"
            @click="toggle(item.id)"
          >
            <span class="min-w-0 flex-1">
              <span class="flex items-center gap-2">
                <span class="truncate text-sm font-semibold">{{ item.name }}</span>
                <StatusPill :status="displayItemStatus(item)" />
              </span>
              <span class="text-muted-foreground mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                <span v-if="isOverdue(item.dueDate) && item.status !== 'accepted'" class="font-semibold text-danger">
                  Prazo {{ dateBr(item.dueDate) }}
                </span>
                <span v-else>Prazo {{ dateBr(item.dueDate) }}</span>
              </span>
            </span>
            <Upload class="text-muted-foreground mt-1 shrink-0 text-base" aria-hidden="true" />
          </button>

          <div v-if="needsResend(item)" class="mx-4 mb-4">
            <ResendNotice :item="item" hint="Envie o documento corrigido no botão abaixo." />
          </div>

          <ul v-if="item.documents.length" class="border-border mx-4 mb-4 divide-y rounded-lg border" role="list">
            <li v-for="(file, index) in item.documents" :key="index" class="flex items-center gap-2 p-3">
              <FileIcon class="text-muted-foreground shrink-0 text-base" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate text-sm">{{ file.fileName }}</span>
              <StatusPill :status="file.reviewStatus" />
            </li>
          </ul>

          <div v-if="expanded === item.id" :id="'upload-' + item.id" class="border-border border-t p-4">
            <p v-if="item.status === 'accepted'" class="text-muted-foreground flex items-center gap-2 text-sm">
              <CircleCheck class="text-success text-base" aria-hidden="true" />
              Este documento já foi conferido e aprovado pela contabilidade.
            </p>
            <p v-else-if="closed" class="text-muted-foreground text-sm">
              Esta competência foi encerrada — envie pelo bloco de documento extra abaixo.
            </p>
            <div v-else-if="sending && retryTarget === item.id" class="border-border flex min-h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center" role="status" aria-live="polite">
              <Upload class="text-primary animate-bounce text-xl" aria-hidden="true" />
              <span class="text-sm font-medium">Enviando arquivos…</span>
              <span class="text-muted-foreground text-xs">Aguarde a confirmação</span>
            </div>
            <div v-else>
              <label
                ref="dropTarget"
                class="border-border hover:bg-muted focus-within:ring-ring flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center focus-within:ring-2"
                :class="{ 'opacity-50 pointer-events-none': sending }"
              >
                <Upload class="text-muted-foreground text-xl" aria-hidden="true" />
                <span class="text-sm font-medium">Arraste os arquivos aqui ou toque para escolher</span>
                <span class="text-muted-foreground text-xs">Pode enviar vários de uma vez, ou um .zip</span>
                <input type="file" multiple class="sr-only" :disabled="sending" @change="pick($event, item.id)" />
              </label>

              <label class="border-border hover:bg-muted focus-within:ring-ring mt-2 flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm font-medium focus-within:ring-2 sm:hidden">
                <Camera class="text-base" aria-hidden="true" />
                Tirar foto do documento
                <input type="file" accept="image/*" capture="environment" class="sr-only" :disabled="sending" @change="pick($event, item.id)" />
              </label>
            </div>
          </div>
        </li>
      </ul>

      <section class="bg-card border-border mt-6 rounded-xl border p-4">
        <h2 class="text-base font-semibold">Enviar documento extra</h2>
        <p class="text-muted-foreground mt-1 text-sm">Se não estiver na lista acima, envie aqui.</p>

        <div v-if="sending && retryTarget === null" class="border-border mt-3 flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center" role="status" aria-live="polite">
          <Upload class="text-primary animate-bounce text-xl" aria-hidden="true" />
          <span class="text-sm font-medium">Enviando arquivos…</span>
          <span class="text-muted-foreground text-xs">Aguarde a confirmação</span>
        </div>
        <label
          v-else
          class="border-border hover:bg-muted focus-within:ring-ring mt-3 flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-4 text-center focus-within:ring-2"
          :class="{ 'opacity-50 pointer-events-none': sending }"
        >
          <span class="text-sm font-medium">Arraste os arquivos aqui ou toque para escolher</span>
          <span class="text-muted-foreground text-xs">Documentos extras não passam pela conferência do checklist</span>
          <input type="file" multiple class="sr-only" :disabled="sending" @change="pick($event, null)" />
        </label>

        <ul v-if="checklistQuery.data.value.extraDocuments.length" class="border-border mt-3 divide-y rounded-lg border" role="list">
          <li v-for="(file, index) in checklistQuery.data.value.extraDocuments" :key="index" class="flex items-center gap-2 p-3">
            <FileIcon class="text-muted-foreground shrink-0 text-base" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate text-sm">{{ file.fileName }}</span>
            <StatusPill :status="file.reviewStatus" />
          </li>
        </ul>
      </section>

      <footer class="mt-8 text-center text-xs text-muted-foreground">
        <span>Já possui cadastro? </span>
        <RouterLink to="/minha-area/acesso" class="font-medium text-foreground hover:underline">
          Acessar Minha Área
        </RouterLink>
      </footer>
    </main>

    <UploadFeedback
      :results="results"
      @dismiss="results = null"
      @retry="send($event, retryTarget)"
    />
  </div>
</template>
