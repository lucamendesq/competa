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
    path: 'perdi-meu-link/confirmar',
    title: 'Confirmar novo link',
    loadComponent: () => import('./recover-confirm-page').then((m) => m.RecoverConfirmPage),
  },
  {
    path: 'esqueci-senha',
    title: 'Esqueci minha senha',
    loadComponent: () => import('./forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'redefinir-senha',
    title: 'Redefinir senha',
    loadComponent: () => import('./reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'convite/:token',
    title: 'Aceitar convite',
    loadComponent: () => import('./invite-page').then((m) => m.InvitePage),
  },
];
