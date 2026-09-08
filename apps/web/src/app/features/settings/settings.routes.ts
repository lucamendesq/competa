import { Routes } from '@angular/router';

export const SETTINGS_ROUTES: Routes = [
  {
    path: '',
    title: 'Configurações',
    loadComponent: () => import('./settings-page').then((m) => m.SettingsPage),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'contabilidade' },
      {
        path: 'contabilidade',
        loadComponent: () => import('./firm-tab').then((m) => m.FirmTab),
      },
      {
        path: 'contadores',
        loadComponent: () => import('./accountants-tab').then((m) => m.AccountantsTab),
      },
      {
        path: 'lembretes',
        loadComponent: () => import('./reminders-tab').then((m) => m.RemindersTab),
      },
      {
        path: 'canais',
        loadComponent: () => import('./channels-tab').then((m) => m.ChannelsTab),
      },
    ],
  },
];
