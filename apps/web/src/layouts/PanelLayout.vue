<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Menu, X, CalendarRange, Building2, SquareCheckBig, Settings, ChevronDown, Sun, Moon, LogOut } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'
import { useTheme } from '../composables/useTheme'
import Logo from '../components/Logo.vue'

const auth = useAuthStore()
const router = useRouter()
const theme = useTheme()

const menuOpen = ref(false)
const profileOpen = ref(false)

const firmName = computed(() => auth.accountant?.accountingFirm.name ?? '')
const isOwner = computed(() => auth.accountant?.accountant.owner === true)
const accountantName = computed(() => auth.accountant?.accountant.name ?? '')
const accountantEmail = computed(() => auth.accountant?.accountant.email ?? '')
const initials = computed(() =>
  accountantName.value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
)

const nav = [
  { path: '/competencias', label: 'Competências', icon: CalendarRange },
  { path: '/empresas', label: 'Empresas', icon: Building2 },
  { path: '/templates', label: 'Checklists', icon: SquareCheckBig },
  { path: '/configuracoes/whatsapp', label: 'WhatsApp', icon: Settings },
]

async function sair() {
  await auth.signOut()
  await router.push('/entrar')
}
</script>

<template>
  <div class="bg-background min-h-dvh lg:flex">
    <a
      href="#conteudo"
      class="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm"
    >
      Pular para o conteúdo
    </a>

    <div class="bg-sidebar text-sidebar-foreground sticky top-0 z-40 flex h-14 items-center gap-3 px-4 lg:hidden">
      <button
        type="button"
        class="focus-visible:ring-sidebar-ring inline-flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        :aria-expanded="menuOpen"
        aria-controls="menu-lateral"
        @click="menuOpen = !menuOpen"
      >
        <span class="sr-only">{{ menuOpen ? 'Fechar menu' : 'Abrir menu' }}</span>
        <component :is="menuOpen ? X : Menu" class="text-lg" aria-hidden="true" />
      </button>
      <p class="truncate text-sm font-semibold">{{ firmName }}</p>
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
      class="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col transition-transform lg:sticky lg:top-0 lg:h-dvh lg:translate-x-0"
      :class="{ '-translate-x-full': !menuOpen }"
      aria-label="Navegação principal"
    >
      <div class="border-sidebar-border flex h-14 items-center gap-2 border-b px-4 lg:h-16">
        <Logo variant="icon" surface="dark" alt="" class="h-8 shrink-0" />
        <p class="truncate text-sm font-semibold">{{ firmName || 'Contabilidade' }}</p>
      </div>

      <ul class="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
        <li v-for="item in nav" :key="item.path">
          <RouterLink
            :to="item.path"
            active-class="bg-sidebar-accent text-sidebar-accent-foreground font-semibold"
            class="hover:bg-sidebar-accent/70 focus-visible:ring-sidebar-ring flex h-10 items-center gap-3 rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
            @click="menuOpen = false"
          >
            <component :is="item.icon" class="text-base" aria-hidden="true" />
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>

      <div class="border-sidebar-border relative border-t p-3">
        <button
          type="button"
          class="hover:bg-sidebar-accent/70 focus-visible:ring-sidebar-ring flex w-full items-center gap-3 rounded-lg p-2 text-left focus-visible:ring-2 focus-visible:outline-none"
          :aria-expanded="profileOpen"
          @click="profileOpen = !profileOpen"
        >
          <span class="bg-sidebar-accent flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold" aria-hidden="true">
            {{ initials }}
          </span>
          <span class="min-w-0 flex-1">
            <span class="block truncate text-sm font-medium">{{ accountantName }}</span>
            <span class="block truncate text-xs opacity-70">{{ accountantEmail }}</span>
          </span>
          <ChevronDown class="text-sm" aria-hidden="true" />
        </button>

        <div v-if="profileOpen" class="bg-popover text-popover-foreground border-border absolute bottom-16 left-3 right-3 rounded-xl border p-1 shadow-lg">
          <RouterLink
            v-if="isOwner"
            to="/configuracoes/contadores"
            class="hover:bg-muted flex h-9 items-center rounded-lg px-3 text-sm"
            @click="profileOpen = false; menuOpen = false"
          >
            Convidar contador
          </RouterLink>
          <button
            type="button"
            class="hover:bg-muted flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm"
            @click="theme.toggle"
          >
            <component :is="theme.dark.value ? Sun : Moon" class="text-sm" aria-hidden="true" />
            {{ theme.dark.value ? 'Tema claro' : 'Tema escuro' }}
          </button>
          <button
            type="button"
            class="hover:bg-muted flex h-9 w-full items-center gap-2 rounded-lg px-3 text-left text-sm"
            @click="sair"
          >
            <LogOut class="text-sm" aria-hidden="true" />
            Sair
          </button>
        </div>
      </div>
    </nav>

    <main id="conteudo" class="min-w-0 flex-1">
      <div class="mx-auto flex max-w-[1600px] flex-col gap-6 p-4 sm:p-6">
        <RouterView />
      </div>
    </main>
  </div>
</template>
