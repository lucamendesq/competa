import { Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, minLength, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowRight } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { Toaster } from '../../core/ui/toast';
import { Logo } from '../../shared/logo';

@Component({
  selector: 'app-reset-password-page',
  imports: [FormField, RouterLink, NgIcon, HlmButtonImports, HlmInputImports, HlmLabel, Logo],
  providers: [provideIcons({ lucideArrowRight })],
  templateUrl: './reset-password-page.html',
})
export class ResetPasswordPage {
  /** query params do link do email (withComponentInputBinding) */
  readonly token = input<string | undefined>();
  readonly error = input<string | undefined>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);

  protected readonly failure = signal<string | null>(null);
  // o better-auth redireciona com ?error=INVALID_TOKEN quando o link já não vale
  protected readonly invalidLink = computed(() => !this.token() || Boolean(this.error()));

  protected readonly credentials = signal({ password: '' });
  protected readonly f = form(this.credentials, (path) => {
    required(path.password, { message: 'Informe a senha nova.' });
    minLength(path.password, 8, { message: 'Use pelo menos 8 caracteres.' });
  });

  protected save() {
    this.failure.set(null);

    return submit(this.f, async (form) => {
      try {
        await this.auth.resetPassword(form().value().password, this.token()!);
        this.toaster.success('Senha redefinida. Entre com a senha nova.');
        await this.router.navigate(['/entrar']);
      } catch (error) {
        this.failure.set(error instanceof Error ? error.message : 'Não foi possível redefinir.');
      }

      return undefined;
    });
  }
}
