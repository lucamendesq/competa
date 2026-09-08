import { NgOptimizedImage } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCircleAlert,
  lucideDownload,
  lucideLink,
  lucideZap,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [
    FormField,
    RouterLink,
    NgIcon,
    HlmButtonImports,
    HlmInputImports,
    HlmLabel,
    NgOptimizedImage,
  ],
  providers: [
    provideIcons({ lucideArrowRight, lucideCircleAlert, lucideDownload, lucideLink, lucideZap }),
  ],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly error = signal<string | null>(null);

  protected readonly credentials = signal({ email: '', password: '' });
  protected readonly f = form(this.credentials, (path) => {
    required(path.email, { message: 'Informe seu e-mail.' });
    email(path.email, { message: 'E-mail inválido.' });
    required(path.password, { message: 'Informe sua senha.' });
  });

  protected readonly benefits = [
    {
      icon: 'lucideZap',
      title: 'Abra a competência com 1 clique',
      text: 'Uma solicitação por empresa ativa, com o checklist e os prazos já congelados.',
    },
    {
      icon: 'lucideLink',
      title: 'Seu cliente envia sem senha e sem cadastro',
      text: 'O Responsável recebe um link de upload com validade e escopo só de envio.',
    },
    {
      icon: 'lucideDownload',
      title: 'Baixe tudo organizado em zip',
      text: 'Por empresa e competência, ou a competência inteira de uma vez.',
    },
  ];

  protected signIn() {
    this.error.set(null);

    return submit(this.f, async (form) => {
      const { email: mail, password } = form().value();

      try {
        await this.auth.signInAccountant(mail, password);
        await this.router.navigate(['/competencias']);
      } catch (error) {
        this.error.set(error instanceof Error ? error.message : 'E-mail ou senha inválidos.');
      }

      return undefined;
    });
  }
}
