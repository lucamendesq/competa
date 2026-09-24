import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideMail } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { authClient } from '../../core/auth/auth-client';
import { Toaster } from '../../core/ui/toast';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-contact-sign-in-page',
  imports: [FormField, RouterLink, NgIcon, HlmButtonImports, HlmInputImports, HlmLabel, Logo],
  providers: [provideIcons({ lucideMail })],
  templateUrl: './contact-sign-in-page.html',
})
export class ContactSignInPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);

  protected readonly linkSent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly credentials = signal({ email: '', password: '' });
  protected readonly f = form(this.credentials, (path) => {
    required(path.email, { message: 'Informe o seu e-mail.' });
    email(path.email, { message: 'E-mail inválido.' });
    required(path.password, { message: 'Informe sua senha.' });
  });

  protected readonly linkRequest = signal({ email: '' });
  protected readonly fLink = form(this.linkRequest, (path) => {
    required(path.email, { message: 'Informe o seu e-mail.' });
    email(path.email, { message: 'E-mail inválido.' });
  });

  protected signIn() {
    this.error.set(null);

    return submit(this.f, async (formTree) => {
      const { email: address, password } = formTree().value();

      try {
        await this.auth.signInContact(address, password);
        await this.router.navigate(['/minha-area/pendencias']);
      } catch {
        this.error.set('E-mail ou senha inválidos. Se você entra pelo link, use a opção abaixo.');
      }

      return undefined;
    });
  }

  protected requestLink() {
    this.error.set(null);

    return submit(this.fLink, async (formTree) => {
      const { error } = await authClient.signIn.magicLink({
        email: formTree().value().email,
        callbackURL: `${window.location.origin}/minha-area/pendencias`,
      });

      if (error) {
        this.error.set('Não foi possível enviar o link. Confira o e-mail e tente de novo.');
        return undefined;
      }

      this.linkSent.set(true);
      this.toaster.success('Link de acesso enviado para o seu e-mail.');

      return undefined;
    });
  }
}
