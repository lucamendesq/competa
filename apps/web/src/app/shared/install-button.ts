import { Component, inject, signal } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideShare, lucideSmartphone, lucideSquarePlus } from '@ng-icons/lucide';
import { InstallService } from './install.service';
import { Modal } from './modal';

@Component({
  selector: 'app-install-button',
  imports: [NgIcon, Modal],
  providers: [provideIcons({ lucideShare, lucideSmartphone, lucideSquarePlus })],
  template: `
    @if (install.canInstall() || install.showIosHint()) {
      <button
        type="button"
        class="focus-visible:ring-sidebar-ring inline-flex size-9 items-center justify-center rounded-lg focus-visible:ring-2 focus-visible:outline-none"
        (click)="onClick()"
      >
        <span class="sr-only">Instalar app</span>
        <ng-icon name="lucideSmartphone" class="text-lg" aria-hidden="true" />
      </button>
    }

    <app-modal
      [(open)]="showTutorial"
      title="Instalar na tela de início"
      description="No Safari, siga estes passos:"
    >
      <ol class="text-foreground space-y-4 text-sm">
        <li class="flex items-center gap-3">
          <span
            class="bg-muted flex size-8 shrink-0 items-center justify-center rounded-full font-semibold"
            >1</span
          >
          <span>Toque no ícone de compartilhar <ng-icon name="lucideShare" class="align-[-2px]" aria-hidden="true" /> na barra do Safari</span>
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
    </app-modal>
  `,
})
export class InstallButton {
  protected readonly install = inject(InstallService);
  protected readonly showTutorial = signal(false);

  protected async onClick() {
    if (this.install.canInstall()) {
      await this.install.promptInstall();
      return;
    }

    this.showTutorial.set(true);
  }
}
