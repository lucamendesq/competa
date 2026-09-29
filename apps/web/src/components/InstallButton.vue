<script setup lang="ts">
import { computed, ref } from 'vue';
import { Smartphone, Share, SquarePlus } from 'lucide-vue-next';
import { Button } from '@/components/ui/button';
import Modal from './Modal.vue';
import { usePwaInstall } from '@/composables/usePwaInstall';

withDefaults(
  defineProps<{
    variant?: 'icon' | 'card';
  }>(),
  {
    variant: 'icon',
  },
);

const install = usePwaInstall();
const showTutorial = ref(false);

const tutorialTitle = computed(() =>
  install.isIos.value ? 'Instalar na tela de início' : 'Instalar aplicativo',
);

const tutorialDescription = computed(() => {
  if (install.isIos.value) return 'No Safari, siga estes passos:';
  if (install.platform.value === 'android') return 'No navegador do seu celular:';
  return 'No seu computador:';
});

async function onClick() {
  if (install.canInstall.value) {
    await install.promptInstall();
    return;
  }
  showTutorial.value = true;
}
</script>

<template>
  <template v-if="!install.isStandalone.value">
    <Button v-if="variant === 'card'" variant="outline" size="sm" type="button" @click="onClick">
      <Smartphone class="text-base" aria-hidden="true" />
      Instalar app
    </Button>
    <button
      v-else
      type="button"
      class="focus-visible:ring-sidebar-ring inline-flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
      title="Instalar aplicativo"
      aria-label="Instalar aplicativo"
      @click="onClick"
    >
      <span class="sr-only">Instalar aplicativo</span>
      <Smartphone class="text-lg" aria-hidden="true" />
    </button>
  </template>

  <Modal v-model:open="showTutorial" :title="tutorialTitle" :description="tutorialDescription">
    <ol v-if="install.isIos.value" class="text-foreground space-y-4 text-sm">
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >1</span
        >
        <span
          >Toque no ícone de compartilhar
          <Share class="inline align-[-2px] h-4 w-4" aria-hidden="true" /> na barra do Safari</span
        >
      </li>
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >2</span
        >
        <span
          >Role e toque em <strong>"Adicionar à Tela de Início"</strong>
          <SquarePlus class="inline align-[-2px] h-4 w-4" aria-hidden="true"
        /></span>
      </li>
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >3</span
        >
        <span>Toque em <strong>"Adicionar"</strong> no canto superior</span>
      </li>
    </ol>
    <ol v-else-if="install.platform.value === 'android'" class="text-foreground space-y-4 text-sm">
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >1</span
        >
        <span>Toque no menu de opções (ícone <strong>⋮</strong> no navegador)</span>
      </li>
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >2</span
        >
        <span
          >Toque em <strong>"Instalar aplicativo"</strong> ou
          <strong>"Adicionar à tela inicial"</strong></span
        >
      </li>
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >3</span
        >
        <span>Confirme para instalar</span>
      </li>
    </ol>
    <ol v-else class="text-foreground space-y-4 text-sm">
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >1</span
        >
        <span
          >No Chrome ou Edge, clique no ícone de instalar na barra de endereços (ou menu
          <strong>⋮</strong> > "Instalar")</span
        >
      </li>
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >2</span
        >
        <span
          >No Safari (macOS), clique em <strong>Arquivo</strong> >
          <strong>"Adicionar ao Dock"</strong></span
        >
      </li>
      <li class="flex items-center gap-3">
        <span
          class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
          >3</span
        >
        <span>Confirme para instalar no seu computador</span>
      </li>
    </ol>
  </Modal>
</template>
