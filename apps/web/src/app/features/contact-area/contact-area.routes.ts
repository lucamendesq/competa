import { Routes } from '@angular/router';
import { contactGuard } from '../../core/auth/contact.guard';

export const CONTACT_AREA_ROUTES: Routes = [
  {
    path: 'acesso',
    title: 'Acessar minha área',
    loadComponent: () => import('./contact-sign-in-page').then((m) => m.ContactSignInPage),
  },
  {
    path: '',
    canMatch: [contactGuard],
    loadComponent: () => import('../../layouts/contact-layout').then((m) => m.ContactLayout),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'pendencias' },
      {
        path: 'pendencias',
        title: 'O que falta enviar',
        loadComponent: () => import('./pending-page').then((m) => m.PendingPage),
      },
      {
        path: 'competencias',
        title: 'Minhas competências',
        loadComponent: () => import('./periods-list-page').then((m) => m.PeriodsListPage),
      },
      {
        path: 'competencias/:periodId',
        title: 'Competência',
        loadComponent: () => import('./period-detail-page').then((m) => m.PeriodDetailPage),
      },
      {
        path: 'definir-senha',
        title: 'Criar senha',
        loadComponent: () => import('./set-password-page').then((m) => m.SetPasswordPage),
      },
    ],
  },
];
