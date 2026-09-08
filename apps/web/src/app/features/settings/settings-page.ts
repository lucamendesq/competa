import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { PageHeader } from '../../shared/page-header';

@Component({
  selector: 'app-settings-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, PageHeader],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  protected readonly tabs = [
    { path: 'contabilidade', label: 'Contabilidade' },
    { path: 'contadores', label: 'Contadores' },
    { path: 'lembretes', label: 'Lembretes' },
    { path: 'canais', label: 'Canais' },
  ];
}
