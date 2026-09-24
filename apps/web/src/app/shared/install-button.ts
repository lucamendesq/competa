import { Component, computed, inject, input, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShare, lucideSmartphone, lucideSquarePlus } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { InstallService } from './install.service';
import { Modal } from './modal';

@Component({
  selector: 'app-install-button',
  imports: [NgIcon, Modal, HlmButtonImports],
  providers: [provideIcons({ lucideShare, lucideSmartphone, lucideSquarePlus })],
  template: `
    @if (!install.isStandalone()) {
      @if (variant() === 'card') {
        <button hlmBtn variant="outline" size="sm" type="button" (click)="onClick()">
          <ng-icon name="lucideSmartphone" class="text-base" aria-hidden="true" />
          Instalar app
        </button>
      } @else {
        <button
          type="button"
          class="focus-visible:ring-sidebar-ring inline-flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
          title="Instalar aplicativo"
          aria-label="Instalar aplicativo"
          (click)="onClick()"
        >
          <span class="sr-only">Instalar aplicativo</span>
          <ng-icon name="lucideSmartphone" class="text-lg" aria-hidden="true" />
        </button>
      }
    }

    <app-modal
      [(open)]="showTutorial"
      [title]="tutorialTitle()"
      [description]="tutorialDescription()"
    >
      @if (install.isIos()) {
        <ol class="text-foreground space-y-4 text-sm">
          <li class="flex items-center gap-3">
            <span
              class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
              >1</span
            >
            <span
              >Toque no ícone de compartilhar
              <ng-icon name="lucideShare" class="align-[-2px]" aria-hidden="true" /> na barra do
              Safari</span
            >
          </li>
          <li class="flex items-center gap-3">
            <span
              class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
              >2</span
            >
            <span
              >Role e toque em <strong>"Adicionar à Tela de Início"</strong>
              <ng-icon name="lucideSquarePlus" class="align-[-2px]" aria-hidden="true" />
            </span>
          </li>
          <li class="flex items-center gap-3">
            <span
              class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
              >3</span
            >
            <span>Toque em <strong>"Adicionar"</strong> no canto superior</span>
          </li>
        </ol>
      } @else if (install.platform() === 'android') {
        <ol class="text-foreground space-y-4 text-sm">
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
      } @else {
        <ol class="text-foreground space-y-4 text-sm">
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
      }
    </app-modal>
  `,
})
export class InstallButton {
  readonly variant = input<'icon' | 'card'>('icon');

  protected readonly install = inject(InstallService);
  protected readonly showTutorial = signal(false);

  protected readonly tutorialTitle = computed(() =>
    this.install.isIos() ? 'Instalar na tela de início' : 'Instalar aplicativo',
  );

  protected readonly tutorialDescription = computed(() => {
    if (this.install.isIos()) return 'No Safari, siga estes passos:';
    if (this.install.platform() === 'android') return 'No navegador do seu celular:';
    return 'No seu computador:';
  });

  protected async onClick() {
    if (this.install.canInstall()) {
      await this.install.promptInstall();
      return;
    }

    this.showTutorial.set(true);
  }
}
