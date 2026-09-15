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
  protected readonly saving = signal(false);

  constructor() {
    effect(() => {
      const loaded = this.firm.value();
      if (loaded) this.name.set(loaded.name);
    });
  }

  protected async save() {
    const name = this.name().trim();
    if (!name || name === this.firm.value()?.name) return;

    this.saving.set(true);

    try {
      await this.service.updateFirm({ name });
      // o nome da firm vive cacheado no AuthService (header, /auth/me)
      await this.auth.reloadAccountant();
      this.firm.reload();
      this.toaster.success('Nome da contabilidade atualizado.');
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível salvar.'));
    } finally {
      this.saving.set(false);
    }
  }
}
