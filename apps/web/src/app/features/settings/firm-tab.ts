import { Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-firm-tab',
  templateUrl: './firm-tab.html',
})
export class FirmTab {
  private readonly auth = inject(AuthService);

  protected readonly firmName = computed(() => this.auth.accountant()?.accountingFirm.name ?? '—');
  protected readonly accountantName = computed(
    () => this.auth.accountant()?.accountant.name ?? '—',
  );
  protected readonly accountantEmail = computed(
    () => this.auth.accountant()?.accountant.email ?? '—',
  );
}
