import { Routes } from '@angular/router';

export const PERIODS_ROUTES: Routes = [
  {
    path: '',
    title: 'Competências',
    loadComponent: () => import('./periods-list-page').then((m) => m.PeriodsListPage),
  },
  {
    path: ':periodId',
    title: 'Painel de Pendências',
    loadComponent: () => import('./pending-panel-page').then((m) => m.PendingPanelPage),
  },
];
