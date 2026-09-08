import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideClipboardList, lucideHistory, lucideLogOut } from '@ng-icons/lucide';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-contact-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgIcon],
  providers: [provideIcons({ lucideClipboardList, lucideHistory, lucideLogOut })],
  templateUrl: './contact-layout.html',
})
export class ContactLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly perfil = computed(() => this.auth.contact());

  protected readonly nav = [
    { path: '/minha-area/pendencias', label: 'O que falta', icon: 'lucideClipboardList' },
    { path: '/minha-area/competencias', label: 'Histórico', icon: 'lucideHistory' },
  ];

  protected async sair() {
    await this.auth.signOut();
    await this.router.navigate(['/minha-area/acesso']);
  }
}
