import { Navigate, Outlet, type RouteObject } from 'react-router';
import { GuestOnly, RequireAccountant, RequireContact } from '@/app/router/guards';
import { RootLayout } from '@/app/router/root-layout';
import { RouteErrorState } from '@/app/router/route-error-state';
import type { RouteHandle } from '@/app/router/route-handle';
import { NotFoundPage } from '@/app/routes/not-found';

const page = (
  path: string,
  load: () => Promise<{ Component: () => React.ReactNode }>,
  handle: RouteHandle = {},
) => ({ path, lazy: load, handle }) satisfies RouteObject;

const segment = (children: RouteObject[]): RouteObject => ({
  errorElement: <RouteErrorState />,
  children,
});

const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: '/__ui',
        lazy: async () => ({ Component: (await import('@/app/routes/ui-gallery')).UiGallery }),
      },
    ]
  : [];

export const routes: RouteObject[] = [
  {
    element: <RootLayout />,
    errorElement: <RouteErrorState />,
    children: [
      ...devRoutes,
      segment([
        page('/termos', () => import('@/app/routes/terms'), {
          title: 'Termos de Uso',
          area: 'public',
        }),
        page('/privacidade', () => import('@/app/routes/privacy'), {
          title: 'Política de Privacidade',
          area: 'public',
        }),
        page('/envio/:linkToken', () => import('@/app/routes/upload'), { area: 'public' }),
        page('/convite/:linkToken', () => import('@/app/routes/invite'), { area: 'public' }),
        page('/perdi-meu-link/confirmar', () => import('@/app/routes/recover-link-confirm'), {
          area: 'public',
        }),
        page('/redefinir-senha', () => import('@/app/routes/reset-password'), { area: 'public' }),
        { path: '/criar-conta', element: <Navigate to="/cadastro" replace /> },
        {
          element: <GuestOnly />,
          children: [
            page('/perdi-meu-link', () => import('@/app/routes/recover-link'), { area: 'public' }),
            page('/esqueci-senha', () => import('@/app/routes/forgot-password'), {
              area: 'public',
            }),
            page('/entrar', () => import('@/app/routes/login'), { area: 'public' }),
            page('/cadastro', () => import('@/app/routes/register'), {
              title: 'Criar conta',
              area: 'public',
            }),
          ],
        },
      ]),
      {
        path: '/minha-area',
        element: <Outlet />,
        children: [
          segment([
            { index: true, element: <Navigate to="/minha-area/pendencias" replace /> },
            {
              element: <GuestOnly />,
              children: [
                page('acesso', () => import('@/app/routes/contact-sign-in'), { area: 'public' }),
              ],
            },
            page('definir-senha', () => import('@/app/routes/contact-set-password'), {
              area: 'public',
            }),
            {
              element: <RequireContact />,
              handle: { area: 'contact' } satisfies RouteHandle,
              children: [
                page('pendencias', () => import('@/app/routes/contact-pending')),
                page('competencias', () => import('@/app/routes/contact-history')),
              ],
            },
          ]),
        ],
      },
      {
        path: '/',
        element: <RequireAccountant />,
        handle: { area: 'accountant' } satisfies RouteHandle,
        children: [
          segment([
            { index: true, element: <Navigate to="/competencias" replace /> },
            page('competencias', () => import('@/app/routes/periods')),
            page('competencias/:id/pendencias', () => import('@/app/routes/pending-panel')),
            page('solicitacoes/:id', () => import('@/app/routes/request-review')),
            page('empresas', () => import('@/app/routes/companies')),
            page('empresas/nova', () => import('@/app/routes/company-form-new')),
            page('empresas/importar', () => import('@/app/routes/import-companies')),
            page('empresas/:id/editar', () => import('@/app/routes/company-form-edit')),
            page('empresas/:id/checklist', () => import('@/app/routes/company-checklist')),
            page('templates', () => import('@/app/routes/checklists')),
            page('templates/:id', () => import('@/app/routes/checklist-form')),
            page('mensagens', () => import('@/app/routes/messages')),
            {
              path: 'configuracoes',
              element: <Navigate to="/configuracoes/contabilidade" replace />,
            },
            page('configuracoes/contabilidade', () => import('@/app/routes/firm-settings')),
            page('configuracoes/contadores', () => import('@/app/routes/accountants-settings')),
            page('configuracoes/whatsapp', () => import('@/app/routes/whatsapp-settings')),
            page('configuracoes/plano', () => import('@/app/routes/plan')),
          ]),
        ],
      },
      /* Catch-all explícito: sem ele uma URL com typo casava com nada e a página ficava
       * vazia — tela branca sem erro, sem 404 e sem cair no guard de login. */
      {
        path: '*',
        element: <NotFoundPage />,
        handle: { title: 'Página não encontrada', area: 'public' } satisfies RouteHandle,
      },
    ],
  },
];
