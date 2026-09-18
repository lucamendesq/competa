import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmLabel } from '@spartan-ng/helm/label';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-firm-tab',
  imports: [FormsModule, HlmButtonImports, HlmInputImports, HlmLabel],
  templateUrl: './firm-tab.html',
})
export class FirmTab {
  private readonly auth = inject(AuthService);
  private readonly service = inject(SettingsService);
  private readonly toaster = inject(Toaster);

  protected readonly isOwner = computed(() => this.auth.accountant()?.accountant.owner === true);
  protected readonly accountantName = computed(
    () => this.auth.accountant()?.accountant.name ?? '—',
  );
  protected readonly accountantEmail = computed(
    () => this.auth.accountant()?.accountant.email ?? '—',
  );

  protected readonly firm = this.service.firm();
  protected readonly name = signal('');
  protected readonly logoUrl = signal('');
  protected readonly contactEmail = signal('');
  protected readonly previewError = signal(false);
  protected readonly saving = signal(false);

  protected readonly isDirty = computed(() => {
    const loaded = this.firm.value();
    if (!loaded) return false;
    const currentName = this.name().trim();
    const currentLogo = this.logoUrl().trim();
    const currentEmail = this.contactEmail().trim();
    const loadedLogo = loaded.logoUrl ?? '';
    const loadedEmail = loaded.contactEmail ?? '';

    return (
      (currentName.length > 0 && currentName !== loaded.name) ||
      currentLogo !== loadedLogo ||
      currentEmail !== loadedEmail
    );
  });

  constructor() {
    effect(() => {
      const loaded = this.firm.value();
      if (loaded) {
        this.name.set(loaded.name);
        this.logoUrl.set(loaded.logoUrl ?? '');
        this.contactEmail.set(loaded.contactEmail ?? '');
      }
    });
  }

  protected async save() {
    const loaded = this.firm.value();
    if (!loaded || !this.isDirty()) return;

    const name = this.name().trim();
    if (!name) return;

    const patch: Parameters<typeof this.service.updateFirm>[0] = {};
    if (name !== loaded.name) patch.name = name;

    const logo = this.logoUrl().trim();
    const loadedLogo = loaded.logoUrl ?? '';
    if (logo !== loadedLogo) {
      patch.logoUrl = logo.length > 0 ? logo : null;
    }

    const email = this.contactEmail().trim();
    const loadedEmail = loaded.contactEmail ?? '';
    if (email !== loadedEmail) {
      patch.contactEmail = email.length > 0 ? email : null;
    }

    this.saving.set(true);

    try {
      await this.service.updateFirm(patch);
      // o nome da firm vive cacheado no AuthService (header, /auth/me)
      await this.auth.reloadAccountant();
      this.firm.reload();
      this.toaster.success('Dados da contabilidade atualizados.');
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível salvar.'));
    } finally {
      this.saving.set(false);
    }
  }
}
