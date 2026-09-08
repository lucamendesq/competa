import { Component } from '@angular/core';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMail, lucideMessageSquare, lucideSmartphone } from '@ng-icons/lucide';
import { StatusPill } from '../../shared/status-pill';

@Component({
  selector: 'app-channels-tab',
  imports: [NgIcon, StatusPill],
  providers: [provideIcons({ lucideMail, lucideMessageSquare, lucideSmartphone })],
  templateUrl: './channels-tab.html',
})
export class ChannelsTab {
  protected readonly channels = [
    {
      icon: 'lucideMail',
      name: 'E-mail',
      state: 'Ativo',
      detail: 'Canal principal: entrega o link, os lembretes e o reenvio por rejeição.',
      active: true,
    },
    {
      icon: 'lucideSmartphone',
      name: 'Push (área do Responsável)',
      state: 'Depende do aparelho',
      detail:
        'Quem instala o app e autoriza notificações recebe aviso de novo pedido, rejeição e prazo.',
      active: true,
    },
    {
      icon: 'lucideMessageSquare',
      name: 'WhatsApp',
      state: 'Não conectado',
      detail: 'Ainda não disponível nesta versão. O fluxo continua por e-mail.',
      active: false,
    },
  ];
}
