<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { ClipboardList, History, LogOut } from 'lucide-vue-next';
import { useAuthStore } from '../stores/auth';
import Logo from '../components/Logo.vue';
import InstallButton from '../components/InstallButton.vue';

const auth = useAuthStore();
const router = useRouter();

const perfil = computed(() => auth.contact);

const nav = [
  { path: '/minha-area/pendencias', label: 'O que falta', icon: ClipboardList },
  { path: '/minha-area/competencias', label: 'Histórico', icon: History },
];

async function sair() {
  await auth.signOut();
  await router.push('/minha-area/acesso');
}
</script>

<template>
  <div class="bg-background flex min-h-dvh flex-col">
    <a
      href="#conteudo"
      class="bg-primary text-primary-foreground sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:rounded-lg focus:px-3 focus:py-2 focus:text-sm"
    >
      Pular para o conteúdo
    </a>

    <header v-if="perfil" class="bg-card border-border sticky top-0 z-40 border-b">
      <div class="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <Logo variant="icon" surface="auto" alt="" class="h-6 shrink-0" />
        <div class="min-w-0 flex-1">
          <template v-if="(perfil?.companies?.length ?? 0) > 1">
            <p class="text-foreground truncate text-sm font-semibold">{{ perfil?.name }}</p>
            <p class="text-muted-foreground truncate text-xs">
              {{ perfil?.companies?.length }} empresas · {{ perfil?.accountingFirmName }}
            </p>
          </template>
          <template v-else>
            <p class="text-foreground truncate text-sm font-semibold">{{ perfil?.companyName }}</p>
            <p class="text-muted-foreground truncate text-xs">{{ perfil?.accountingFirmName }}</p>
          </template>
        </div>
        <InstallButton variant="card" />
        <button
          type="button"
          class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none"
          @click="sair"
        >
          <LogOut class="size-3.5" aria-hidden="true" />
          Sair
        </button>
      </div>

      <nav class="border-border hidden border-t sm:block" aria-label="Navegação">
        <ul class="mx-auto flex max-w-3xl gap-1 px-2">
          <li v-for="item in nav" :key="item.path">
            <RouterLink
              :to="item.path"
              active-class="border-primary text-primary font-semibold"
              class="text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring flex h-11 items-center gap-2 border-b-2 border-transparent px-3 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none"
            >
              <component :is="item.icon" class="size-4" aria-hidden="true" />
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>
    </header>

    <main id="conteudo" class="mx-auto w-full max-w-3xl flex-1 p-4 pb-24 sm:pb-6">
      <RouterView />
    </main>

    <nav
      v-if="perfil"
      class="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card shadow-lg sm:hidden"
      aria-label="Navegação"
    >
      <ul class="flex">
        <li v-for="item in nav" :key="item.path" class="flex-1">
          <RouterLink
            :to="item.path"
            active-class="text-primary font-semibold"
            class="text-muted-foreground hover:text-foreground focus-visible:ring-ring flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] focus-visible:ring-2 focus-visible:outline-none transition-colors"
          >
            <component :is="item.icon" class="size-5" aria-hidden="true" />
            {{ item.label }}
          </RouterLink>
        </li>
      </ul>
    </nav>
  </div>
</template>
