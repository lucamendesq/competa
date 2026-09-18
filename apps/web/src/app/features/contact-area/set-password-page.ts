import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormField, form, minLength, required, submit } from '@angular/forms/signals';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';

@Component({
  selector: 'app-set-password-page',
  imports: [FormField, RouterLink, NgIcon, HlmButtonImports, HlmInputImports, HlmLabel],
  providers: [provideIcons({ lucideCheck })],
  template: `
    <div class="mx-auto max-w-sm pt-8">
      <h1 class="text-xl font-semibold tracking-tight">Criar senha</h1>
      <p class="text-muted-foreground mt-1 text-sm">
        Crie uma senha para entrar diretamente na sua área sem depender do link.
      </p>

      @if (success()) {
        <div
          class="mt-6 flex items-center gap-3 rounded-xl border border-success-border bg-success-surface p-4"
          role="status"
        >
          <ng-icon name="lucideCheck" class="shrink-0 text-success text-xl" aria-hidden="true" />
          <div>
            <p class="text-sm font-semibold text-success-foreground">Senha criada!</p>
            <p class="mt-0.5 text-xs text-success-foreground">
              Agora você pode entrar com e-mail e senha quando quiser.
            </p>
          </div>
        </div>
        <a hlmBtn class="mt-4 w-full" routerLink="/minha-area/pendencias"> Ir para pendências </a>
      } @else {
        <form
          id="set-password-form"
          class="mt-6 flex flex-col gap-4"
          (submit)="$event.preventDefault(); save()"
        >
          @if (failure()) {
            <p
              class="rounded-lg border border-danger-border bg-danger-surface p-3 text-sm text-danger-foreground"
              role="alert"
            >
              {{ failure() }}
            </p>
          }

          <div class="flex flex-col gap-1.5">
            <label hlmLabel for="new-password">
              Senha <span class="text-destructive" aria-hidden="true">*</span
              ><span class="sr-only">(obrigatório)</span>
            </label>
            <input
              hlmInput
              id="new-password"
              type="password"
              autocomplete="new-password"
              placeholder="Mínimo 8 caracteres"
              [formField]="f.password"
            />
            @if (f.password().invalid() && f.password().touched()) {
              <p class="text-destructive text-xs">
                {{ f.password().errors()[0]?.message }}
              </p>
            }
          </div>
        </form>

        <div class="mt-4 flex flex-wrap justify-end gap-2">
          <a hlmBtn variant="ghost" routerLink="/minha-area/pendencias">Cancelar</a>
          <button hlmBtn type="submit" form="set-password-form" [disabled]="f().submitting()">
            {{ f().submitting() ? 'Salvando…' : 'Criar senha' }}
          </button>
        </div>
      }
    </div>
  `,
})
export class SetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toaster = inject(Toaster);

  protected readonly success = signal(false);
  protected readonly failure = signal<string | null>(null);

  protected readonly credentials = signal({ password: '' });
  protected readonly f = form(this.credentials, (path) => {
    required(path.password, { message: 'Informe a senha.' });
    minLength(path.password, 8, { message: 'Use pelo menos 8 caracteres.' });
  });

  protected save() {
    this.failure.set(null);

    return submit(this.f, async (formTree) => {
      try {
        await this.auth.setContactPassword(formTree().value().password);
        this.success.set(true);
      } catch (error) {
        this.failure.set(apiErrorMessage(error, 'Não foi possível criar a senha.'));
      }

      return undefined;
    });
  }
}
