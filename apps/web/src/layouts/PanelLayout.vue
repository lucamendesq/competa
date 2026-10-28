<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  Menu,
  X,
  CalendarRange,
  Building2,
  SquareCheckBig,
  Settings,
  ChevronDown,
  LogOut,
} from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import Logo from '../components/Logo.vue';

const auth = useAuthStore();
const router = useRouter();

const menuOpen = ref(false);
const profileOpen = ref(false);

const firmName = computed(() => auth.accountant?.accountingFirm.name ?? '');
const isOwner = computed(() => auth.accountant?.accountant.owner === true);
const accountantName = computed(() => auth.accountant?.accountant.name ?? '');
const accountantEmail = computed(() => auth.accountant?.accountant.email ?? '');
const initials = computed(() =>
  accountantName.value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join(''),
);

const nav = [
  { path: '/competencias', label: 'Competências', icon: CalendarRange },
  { path: '/empresas', label: 'Empresas', icon: Building2 },
  { path: '/templates', label: 'Checklists', icon: SquareCheckBig },
  { path: '/configuracoes/contabilidade', label: 'Contabilidade', icon: Settings },
  { path: '/configuracoes/whatsapp', label: 'WhatsApp', icon: Settings },
  { path: '/configuracoes/plano', label: 'Plano e Assinatura', icon: SquareCheckBig },
];

async function sair() {
  await auth.signOut();
  await router.push('/entrar');
}
</script>

<template>
  <div class="bg-background min-h-dvh lg:flex">
    <a
      href="#conteudo"
      class="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      Pular para o conteúdo
    </a>

    <div
      class="bg-white border-b border-border text-slate-900 sticky top-0 z-40 flex h-14 items-center gap-3 px-4 lg:hidden"
    >
      <button
        type="button"
        class="text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none inline-flex size-9 items-center justify-center rounded-lg transition-colors"
        :aria-expanded="menuOpen"
        aria-controls="menu-lateral"
        @click="menuOpen = !menuOpen"
      >
        <span class="sr-only">{{ menuOpen ? 'Fechar menu' : 'Abrir menu' }}</span>
        <component :is="menuOpen ? X : Menu" class="size-5" aria-hidden="true" />
      </button>
      <div class="h-4 w-px bg-border" aria-hidden="true" />
      <p class="truncate text-sm font-semibold text-slate-900">{{ firmName || 'Contabilidade' }}</p>
    </div>

    <button
      v-if="menuOpen"
      type="button"
      class="fixed inset-0 z-40 bg-slate-900/40 lg:hidden"
      aria-label="Fechar menu"
      @click="menuOpen = false"
    ></button>

    <nav
      id="menu-lateral"
      class="bg-white text-slate-900 border-r border-border fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0"
      :class="{ '-translate-x-full': !menuOpen }"
      aria-label="Navegação principal"
    >
      <div class="border-b border-border flex h-14 items-center gap-2.5 px-4 lg:h-16">
        <Logo variant="icon" surface="auto" alt="" class="h-8 shrink-0" />
        <p class="truncate text-sm font-semibold text-slate-900">
          {{ firmName || 'Contabilidade' }}
        </p>
      </div>

      <ul class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <li v-for="item in nav" :key="item.path">
          <RouterLink
            :to="item.path"
            active-class="bg-brand-light text-brand-strong font-semibold"
            class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none transition-colors"
            @click="menuOpen = false"
          >
            <component :is="item.icon" class="size-4 shrink-0" aria-hidden="true" />
            <span>{{ item.label }}</span>
          </RouterLink>
        </li>
      </ul>

      <div class="border-border relative border-t p-3">
        <button
          type="button"
          class="hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors"
          :aria-expanded="profileOpen"
          @click="profileOpen = !profileOpen"
        >
          <span
            class="bg-amber-100 text-amber-900 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
            aria-hidden="true"
          >
            {{ initials }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium text-slate-900">{{
              accountantName
            }}</span>
            <span class="block truncate text-xs text-slate-600">{{ accountantEmail }}</span>
          </span>
          <ChevronDown class="size-4 text-slate-500 shrink-0" aria-hidden="true" />
        </button>

        <div
          v-if="profileOpen"
          class="bg-white text-slate-900 border-border absolute bottom-16 left-3 right-3 rounded-xl border p-1 shadow-lg z-50"
        >
          <RouterLink
            v-if="isOwner"
            to="/configuracoes/contadores"
            class="hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none flex h-9 items-center rounded-lg px-3 text-sm text-slate-700 hover:text-slate-900 transition-colors"
            @click="
              profileOpen = false;
              menuOpen = false;
            "
          >
            Convidar contador
          </RouterLink>
          <button
            type="button"
            class="hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm text-slate-700 hover:text-slate-900 transition-colors"
            @click="sair"
          >
            <LogOut class="size-4 shrink-0 text-slate-500" aria-hidden="true" />
            Sair
          </button>
        </div>
      </div>
    </nav>

    <main id="conteudo" class="min-w-0 flex-1 flex flex-col">
      <div
        v-if="auth.isOverdue"
        class="bg-destructive/10 text-destructive border-b border-destructive/20 px-4 py-3 text-sm text-center font-medium"
      >
        Sua assinatura está pendente e o acesso de escrita foi bloqueado.
        <RouterLink to="/configuracoes/plano" class="underline underline-offset-2 ml-1"
          >Regularizar agora</RouterLink
        >.
      </div>
      <div class="mx-auto flex max-w-[1600px] flex-col gap-6 w-full p-4 sm:p-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>
