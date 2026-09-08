import { Routes } from '@angular/router';

export const COMPANIES_ROUTES: Routes = [
  {
    path: '',
    title: 'Empresas',
    loadComponent: () => import('./companies-list-page').then((m) => m.CompaniesListPage),
  },
  {
    path: 'nova',
    title: 'Nova empresa',
    loadComponent: () => import('./company-form-page').then((m) => m.CompanyFormPage),
  },
  {
    path: 'importar',
    title: 'Importar planilha',
    loadComponent: () => import('./import-companies-page').then((m) => m.ImportCompaniesPage),
  },
  {
    path: ':companyId/editar',
    title: 'Editar empresa',
    loadComponent: () => import('./company-form-page').then((m) => m.CompanyFormPage),
  },
  {
    path: ':companyId/checklist',
    title: 'Checklist da empresa',
    loadComponent: () => import('./company-checklist-page').then((m) => m.CompanyChecklistPage),
  },
];
