import { Routes } from '@angular/router';

export const UPLOAD_ROUTES: Routes = [
  {
    path: ':token',
    title: 'Enviar documentos',
    loadComponent: () => import('./upload-page').then((m) => m.UploadPage),
  },
];
