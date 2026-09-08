import { Routes } from '@angular/router';
import type { TemplateDetailPage } from './template-detail-page';

export const CHECKLISTS_ROUTES: Routes = [
  {
    path: '',
    title: 'Checklists',
    loadComponent: () => import('./templates-list-page').then((m) => m.TemplatesListPage),
  },
  {
    path: ':templateId',
    title: 'Template de checklist',
    loadComponent: () => import('./template-detail-page').then((m) => m.TemplateDetailPage),
    /** O rascunho do modelo vive só em memória: sair sem salvar descartaria em silêncio. */
    canDeactivate: [(page: TemplateDetailPage) => page.confirmLeave()],
  },
];
