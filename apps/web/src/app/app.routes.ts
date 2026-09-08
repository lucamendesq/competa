import { Routes } from '@angular/router';
import { accountantGuard } from './core/auth/accountant.guard';
import { AUTH_ROUTES } from './features/auth/auth.routes';

export const routes: Routes = [
  ...AUTH_ROUTES,
  {
    path: 'envio',
    loadChildren: () => import('./features/upload/upload.routes').then((m) => m.UPLOAD_ROUTES),
  },
  {
    path: 'minha-area',
    loadChildren: () =>
      import('./features/contact-area/contact-area.routes').then((m) => m.CONTACT_AREA_ROUTES),
  },
  {
    path: '',
    canMatch: [accountantGuard],
    loadComponent: () => import('./layouts/panel-layout').then((m) => m.PanelLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'competencias' },
      {
        path: 'competencias',
        loadChildren: () =>
          import('./features/periods/periods.routes').then((m) => m.PERIODS_ROUTES),
      },
      {
        path: 'solicitacoes',
        loadChildren: () =>
          import('./features/requests/requests.routes').then((m) => m.REQUESTS_ROUTES),
      },
      {
        path: 'empresas',
        loadChildren: () =>
          import('./features/companies/companies.routes').then((m) => m.COMPANIES_ROUTES),
      },
      {
        path: 'checklists',
        loadChildren: () =>
          import('./features/checklists/checklists.routes').then((m) => m.CHECKLISTS_ROUTES),
      },
      {
        path: 'mensagens',
        loadChildren: () =>
          import('./features/messages/messages.routes').then((m) => m.MESSAGES_ROUTES),
      },
      {
        path: 'configuracoes',
        loadChildren: () =>
          import('./features/settings/settings.routes').then((m) => m.SETTINGS_ROUTES),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
