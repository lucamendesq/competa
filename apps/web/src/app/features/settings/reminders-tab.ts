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
  selector: 'app-reminders-tab',
  imports: [FormsModule, HlmButtonImports, HlmInputImports, HlmLabel],
  templateUrl: './reminders-tab.html',
})
export class RemindersTab {
  private readonly service = inject(SettingsService);
  private readonly auth = inject(AuthService);
  private readonly toaster = inject(Toaster);

  protected readonly isOwner = computed(() => this.auth.accountant()?.accountant.owner === true);

  protected readonly firm = this.service.firm();
  protected readonly reminderMax = signal(2);
  protected readonly dueSoonDays = signal(3);
  protected readonly gapDays = signal(3);
  protected readonly saving = signal(false);
  protected readonly running = signal(false);

  constructor() {
    effect(() => {
      const loaded = this.firm.value();
      if (!loaded) return;

      this.reminderMax.set(loaded.reminderMax);
      this.dueSoonDays.set(loaded.reminderDueSoonDays);
      this.gapDays.set(loaded.reminderGapDays);
    });
  }

  protected readonly dirty = computed(() => {
    const loaded = this.firm.value();
    if (!loaded) return false;

    return (
      this.reminderMax() !== loaded.reminderMax ||
      this.dueSoonDays() !== loaded.reminderDueSoonDays ||
      this.gapDays() !== loaded.reminderGapDays
    );
  });

  protected async save() {
    this.saving.set(true);

    try {
      await this.service.updateFirm({
        reminderMax: this.reminderMax(),
        reminderDueSoonDays: this.dueSoonDays(),
        reminderGapDays: this.gapDays(),
      });
      this.firm.reload();
      this.toaster.success('Preferências de lembrete salvas.');
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível salvar.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async runNow() {
    this.running.set(true);

    try {
      await this.service.runReminders();
      this.toaster.success('Varredura de lembretes disparada.');
    } catch (error) {
      this.toaster.error(apiErrorMessage(error, 'Não foi possível disparar os lembretes.'));
    } finally {
      this.running.set(false);
    }
  }
}
