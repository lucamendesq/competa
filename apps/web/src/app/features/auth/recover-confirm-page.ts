import { Component, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight, lucideMailCheck } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { Api } from '../../core/http/api';
import { Logo } from '../../shared/logo';

/** Passo 2 do "perdi meu link": botão, NUNCA auto-fire no load — scanner de email que
 *  executa JS rotacionaria o link vivo do Responsável. */
@Component({
  selector: 'app-recover-confirm-page',
  imports: [RouterLink, NgIcon, HlmButtonImports, Logo],
  providers: [provideIcons({ lucideArrowRight, lucideMailCheck })],
  templateUrl: './recover-confirm-page.html',
})
export class RecoverConfirmPage {
  /** query param `?token=` (withComponentInputBinding) */
  readonly token = input<string | undefined>();

  private readonly api = inject(Api);

  protected readonly sending = signal(false);
  protected readonly sent = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async confirm() {
    const token = this.token();
    if (!token) return;

    this.sending.set(true);
    this.error.set(null);

    try {
      await this.api.post('/access/recover/confirm', { token });
      this.sent.set(true);
    } catch {
      this.error.set('Muitas tentativas. Espere um minuto e tente de novo.');
    } finally {
      this.sending.set(false);
    }
  }
}
