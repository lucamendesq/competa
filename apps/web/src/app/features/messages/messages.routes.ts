import { Routes } from '@angular/router';

export const MESSAGES_ROUTES: Routes = [
  {
    path: '',
    title: 'Mensagens',
    loadComponent: () => import('./messages-list-page').then((m) => m.MessagesListPage),
  },
];
