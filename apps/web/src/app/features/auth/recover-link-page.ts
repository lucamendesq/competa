import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormField, email, form, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideMailCheck } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { Logo } from '../../shared/logo';

/** "Perdi meu link" (D14, item 6). A tela mostra a MESMA confirmação em todos os casos —
 *  email com acesso, Responsável sem acesso e email desconhecido —, porque a resposta da
 *  API é idêntica de propósito: distinguir revelaria quem é cliente de quem. */
@Component({
  selector: 'app-recover-link-page',
  imports: [FormField, RouterLink, NgIcon, HlmButtonImports, HlmInputImports, HlmLabel, Logo],
  providers: [provideIcons({ lucideArrowRight, lucideMailCheck })],
  templateUrl: './recover-link-page.html',
})
export class RecoverLinkPage {
  private readonly auth = inject(AuthService);

  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly credentials = signal({ email: '' });
  protected readonly f = form(this.credentials, (path) => {
    required(path.email, { message: 'Informe seu e-mail.' });
    email(path.email, { message: 'E-mail inválido.' });
  });

  protected send() {
    this.error.set(null);

    return submit(this.f, async (form) => {
      try {
        await this.auth.recoverLink(form().value().email);
        this.sent.set(true);
      } catch {
        this.error.set('Muitas tentativas. Espere um minuto e tente de novo.');
      }

      return undefined;
    });
  }
}
