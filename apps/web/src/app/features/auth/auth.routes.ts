import { Routes } from '@angular/router';

export const AUTH_ROUTES: Routes = [
  {
    path: 'entrar',
    title: 'Entrar',
    loadComponent: () => import('./login-page').then((m) => m.LoginPage),
  },
  {
    path: 'perdi-meu-link',
    title: 'Perdi meu link',
    loadComponent: () => import('./recover-link-page').then((m) => m.RecoverLinkPage),
  },
  {
    path: 'convite/:token',
    title: 'Aceitar convite',
    loadComponent: () => import('./invite-page').then((m) => m.InvitePage),
  },
];
