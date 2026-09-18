import { Component, computed, inject, signal } from '@angular/core';
import { FormField, form, submit, validateStandardSchema } from '@angular/forms/signals';
import { CreateInviteBody } from '@competa/contracts';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCopy, lucideLock, lucideTrash2, lucideUserPlus, lucideX } from '@ng-icons/lucide';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { dateBr } from '../../shared/format';
import { Modal } from '../../shared/modal';
import { SettingsService, CreatedInvite, TeamAccountant } from './settings.service';

@Component({
  selector: 'app-accountants-tab',
  imports: [FormField, NgIcon, HlmButtonImports, HlmInputImports, HlmLabel, Modal],
  providers: [provideIcons({ lucideCopy, lucideLock, lucideTrash2, lucideUserPlus, lucideX })],
  templateUrl: './accountants-tab.html',
})
export class AccountantsTab {
  private readonly service = inject(SettingsService);
  private readonly auth = inject(AuthService);
  private readonly toaster = inject(Toaster);

  protected readonly isOwner = computed(() => this.auth.accountant()?.accountant.owner === true);
  protected readonly myEmail = computed(() => this.auth.accountant()?.accountant.email);
  protected readonly dateBr = dateBr;

  protected readonly team = this.service.accountants();
  protected readonly pending = this.service.pendingInvites();

  /** contador marcado para remoção — o modal de confirmação lê daqui */
  protected readonly removing = signal<TeamAccountant | null>(null);
  protected readonly acting = signal(false);

  protected async confirmRemove() {
    const target = this.removing();
    if (!target) return;

    this.acting.set(true);

    try {
      await this.service.removeAccountant(target.id);
      this.toaster.success(`${target.name} perdeu o acesso à contabilidade.`);
      this.removing.set(null);
      this.team.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível remover.'));
    } finally {
      this.acting.set(false);
    }
  }

  protected async revokeInvite(id: string) {
    try {
      await this.service.revokeInvite(id);
      this.toaster.success('Convite revogado. O link deixou de valer.');
      this.pending.reload();
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível revogar.'));
    }
  }

  protected readonly modalOpen = signal(false);
  protected readonly created = signal<CreatedInvite | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly data = signal({ email: '' });
  protected readonly f = form(this.data, (path) => validateStandardSchema(path, CreateInviteBody));

  protected open() {
    this.data.set({ email: '' });
    this.f().reset();
    this.created.set(null);
    this.error.set(null);
    this.modalOpen.set(true);
  }

  protected invite() {
    this.error.set(null);

    return submit(this.f, async (formTree) => {
      try {
        this.created.set(await this.service.invite({ email: formTree().value().email }));
        this.toaster.success('Convite criado e enviado por e-mail.');
        this.pending.reload();
      } catch (error) {
        this.error.set(apiErrorMessage(error, 'Não foi possível criar o convite.'));
      }

      return undefined;
    });
  }

  protected async copy() {
    const invite = this.created();
    if (!invite) return;

    try {
      await navigator.clipboard.writeText(invite.url);
      this.toaster.success('Link do convite copiado.');
    } catch {
      this.toaster.error('Não foi possível copiar o link.');
    }
  }
}
