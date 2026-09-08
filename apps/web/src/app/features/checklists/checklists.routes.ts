import { Routes } from '@angular/router';

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
  },
];
