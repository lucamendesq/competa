import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { form, FormField, submit, validateStandardSchema } from '@angular/forms/signals';
import { AcceptContactInviteBody, SignUpBody } from '@competa/contracts';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideArrowRight,
  lucideCheck,
  lucideCircle,
  lucideCircleAlert,
  lucideClock,
} from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { apiResource } from '../../core/http/api';
import { apiErrorMessage } from '../../core/http/api-error';
import { AuthService } from '../../core/auth/auth.service';
import { Logo } from '../../shared/logo';

const passwordCriteria = (password: string) => ({
  criteria: [
    password.length >= 8,
    /[a-z]/.test(password) && /[A-Z]/.test(password),
    /[0-9]|[^A-Za-z0-9]/.test(password),
  ],
});

type Invite = {
  email: string;
  invitedBy: string | null;
  companyName: string | null;
  target: 'accounting_firm' | 'company';
};

@Component({
  selector: 'app-invite-page',
  imports: [FormField, RouterLink, NgIcon, HlmButtonImports, HlmInputImports, HlmLabel, Logo],
  providers: [
    provideIcons({ lucideArrowRight, lucideCheck, lucideCircle, lucideCircleAlert, lucideClock }),
  ],
  templateUrl: './invite-page.html',
})
export class InvitePage {
  readonly token = input.required<string>();

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly invite = apiResource<Invite>(() => `/invites/${this.token()}`);
  protected readonly inviteInvalid = computed(() => this.invite.error() !== undefined);
  protected readonly isContactInvite = computed(() => this.invite.value()?.target === 'company');
  protected readonly error = signal<string | null>(null);

  protected readonly data = linkedSignal(() => ({
    name: '',
    email: this.invite.value()?.email ?? '',
    password: '',
    token: this.token(),
  }));
  protected readonly f = form(this.data, (path) => validateStandardSchema(path, SignUpBody));
  protected readonly passwordStrength = computed(() => passwordCriteria(this.data().password));

  protected readonly access = signal({ name: '', password: '' });
  protected readonly fAccess = form(this.access, (path) =>
    validateStandardSchema(path, AcceptContactInviteBody),
  );
  protected readonly accessPasswordStrength = computed(() =>
    passwordCriteria(this.access().password),
  );

  protected readonly criteria = [
    { label: 'Mínimo de 8 caracteres' },
    { label: 'Letra maiúscula e minúscula' },
    { label: 'Número ou caractere especial' },
  ];

  protected async activateContactAccess() {
    this.error.set(null);

    return submit(this.fAccess, async (tree) => {
      try {
        const email = this.invite.value()?.email;
        if (!email) return undefined;

        await this.auth.acceptContactInvite(this.token(), tree().value());
        await this.auth.signInContact(email, tree.password().value());
        await this.router.navigate(['/minha-area/pendencias']);
      } catch (error) {
        this.error.set(apiErrorMessage(error, 'Não foi possível criar seu acesso.'));
      }
    });
  }

  protected createAccount() {
    this.error.set(null);

    return submit(this.f, async (formTree) => {
      const { name, email, password } = formTree().value();

      try {
        await this.auth.signUpWithInvite({ name, email, password }, this.token());
        await this.auth.signInAccountant(email, password);
        await this.router.navigate(['/competencias']);
      } catch (error) {
        this.error.set(apiErrorMessage(error, 'Não foi possível criar sua conta.'));
      }

      return undefined;
    });
  }
}
