import { Routes } from '@angular/router';
import type { RequestReviewPage } from './request-review-page';

export const REQUESTS_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: '/competencias',
  },
  {
    path: ':requestId',
    title: 'Revisão da Solicitação',
    loadComponent: () => import('./request-review-page').then((m) => m.RequestReviewPage),
    /** O rascunho da revisão só existe em memória: sair descartava 10 decisões em
     *  silêncio, no trabalho mais denso do Contador. */
    canDeactivate: [(page: RequestReviewPage) => page.confirmLeave()],
  },
];
