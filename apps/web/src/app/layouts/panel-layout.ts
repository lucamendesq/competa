import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideBuilding2,
  lucideCalendarRange,
  lucideChevronDown,
  lucideLogOut,
  lucideMail,
  lucideMenu,
  lucideMoon,
  lucideSettings,
  lucideSun,
  lucideSquareCheckBig,
  lucideX,
} from '@ng-icons/lucide';
import { AuthService } from '../core/auth/auth.service';
import { ThemeService } from '../core/ui/theme.service';
import { Logo } from '../shared/logo';

@Component({
  selector: 'app-panel-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon, Logo],
  providers: [
    provideIcons({
      lucideBuilding2,
      lucideCalendarRange,
      lucideChevronDown,
      lucideLogOut,
      lucideMail,
      lucideMenu,
      lucideMoon,
      lucideSettings,
      lucideSun,
      lucideSquareCheckBig,
      lucideX,
    }),
  ],
  templateUrl: './panel-layout.html',
})
export class PanelLayout {
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly profileOpen = signal(false);

  protected readonly firmName = computed(() => this.auth.accountant()?.accountingFirm.name ?? '');
  protected readonly isOwner = computed(() => this.auth.accountant()?.accountant.owner === true);
  protected readonly accountantName = computed(() => this.auth.accountant()?.accountant.name ?? '');
  protected readonly accountantEmail = computed(
    () => this.auth.accountant()?.accountant.email ?? '',
  );
  protected readonly initials = computed(() =>
    this.accountantName()
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join(''),
  );

  protected readonly nav = [
    { path: '/competencias', label: 'Competências', icon: 'lucideCalendarRange' },
    { path: '/empresas', label: 'Empresas', icon: 'lucideBuilding2' },
    { path: '/checklists', label: 'Checklists', icon: 'lucideSquareCheckBig' },
    { path: '/mensagens', label: 'Mensagens', icon: 'lucideMail' },
    { path: '/configuracoes', label: 'Configurações', icon: 'lucideSettings' },
  ];

  protected async sair() {
    await this.auth.signOut();
    await this.router.navigate(['/entrar']);
  }
}
