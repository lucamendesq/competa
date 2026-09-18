import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideClipboardList,
  lucideHistory,
  lucideLogOut,
  lucideMoon,
  lucideSun,
} from '@ng-icons/lucide';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/ui/theme.service';
import { InstallButton } from '../shared/install-button';
import { InstallService } from '../shared/install.service';
import { Logo } from '../shared/logo';

@Component({
  selector: 'app-contact-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, Logo, InstallButton],
  providers: [
    provideIcons({ lucideClipboardList, lucideHistory, lucideLogOut, lucideMoon, lucideSun }),
  ],
  templateUrl: './contact-layout.html',
})
export class ContactLayout {
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly install = inject(InstallService);

  protected readonly perfil = computed(() => this.auth.contact());

  protected readonly nav = [
    { path: '/minha-area/pendencias', label: 'O que falta', icon: 'lucideClipboardList' },
    { path: '/minha-area/competencias', label: 'Histórico', icon: 'lucideHistory' },
  ];

  constructor() {
    void this.install.pingOnce();
  }

  protected async sair() {
    await this.auth.signOut();
    await this.router.navigate(['/minha-area/acesso']);
  }
}
