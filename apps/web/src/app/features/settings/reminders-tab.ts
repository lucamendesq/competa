import { Component, inject, signal } from '@angular/core';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { apiErrorMessage } from '../../core/http/api-error';
import { Toaster } from '../../core/ui/toast';
import { SettingsService } from './settings.service';

@Component({
  selector: 'app-reminders-tab',
  imports: [HlmButtonImports],
  templateUrl: './reminders-tab.html',
})
export class RemindersTab {
  private readonly service = inject(SettingsService);
  private readonly toaster = inject(Toaster);

  protected readonly running = signal(false);

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
